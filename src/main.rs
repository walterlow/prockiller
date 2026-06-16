#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use iced::keyboard::{self, key};
use iced::mouse::{self, Interaction};
use iced::widget::scrollable::{Direction, Scrollbar};
use iced::widget::text::Wrapping;
use iced::widget::{button, column, container, mouse_area, row, scrollable, text, text_input};
use iced::{
    event, time, window, Alignment, Background, Border, Color, Element, Length, Padding, Shadow,
    Subscription, Task, Theme,
};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const RELEASE_API_URL: &str = "https://api.github.com/repos/walterlow/prockiller/releases/latest";
const ACTION_COLUMN_WIDTH: f32 = 70.0;
const ACTION_GUTTER_WIDTH: f32 = 6.0;
const HEADER_HEIGHT: f32 = 34.0;
const RESIZE_HANDLE_WIDTH: f32 = 6.0;
const RESIZE_LINE_WIDTH: f32 = 1.0;
const AUTO_REFRESH_INTERVAL: Duration = Duration::from_secs(5);
const COLUMN_COUNT: usize = 6;
const MIN_COLUMN_UNITS: u16 = 5;
const RESIZE_STEP_PX: f32 = 7.0;
const DEFAULT_COLUMN_UNITS: [u16; COLUMN_COUNT] = [9, 26, 26, 14, 9, 26];

fn main() -> iced::Result {
    iced::application(Prockiller::boot, Prockiller::update, Prockiller::view)
        .title("Prockiller")
        .window(window::Settings {
            icon: app_icon(),
            ..window::Settings::default()
        })
        .theme(Theme::GruvboxDark)
        .subscription(Prockiller::subscription)
        .run()
}

fn app_icon() -> Option<window::Icon> {
    window::icon::from_rgba(include_bytes!("../icon.rgba").to_vec(), 128, 128).ok()
}

struct Prockiller {
    port_filter: String,
    filter: String,
    connections: Vec<ConnectionInfo>,
    status: String,
    activity: Vec<String>,
    is_busy: bool,
    is_refreshing: bool,
    auto_refresh_enabled: bool,
    quick_filter: QuickFilter,
    sort_column: SortColumn,
    sort_direction: SortDirection,
    column_units: [u16; COLUMN_COUNT],
    resize_drag: Option<ResizeDrag>,
    pending_action: Option<PendingAction>,
    recent_ports: Vec<u16>,
    update: UpdateState,
}

impl Default for Prockiller {
    fn default() -> Self {
        Self {
            port_filter: String::new(),
            filter: String::new(),
            connections: Vec::new(),
            status: "Refresh to list active network connections.".to_string(),
            activity: vec![
                "Ready. Refresh or enter a port to narrow the connection list.".to_string(),
            ],
            is_busy: false,
            is_refreshing: false,
            auto_refresh_enabled: true,
            quick_filter: QuickFilter::All,
            sort_column: SortColumn::LocalAddress,
            sort_direction: SortDirection::Ascending,
            column_units: DEFAULT_COLUMN_UNITS,
            resize_drag: None,
            pending_action: None,
            recent_ports: Vec::new(),
            update: UpdateState::Idle,
        }
    }
}

#[derive(Debug, Clone)]
enum Message {
    PortFilterChanged(String),
    RememberPortFilter,
    ClearPortFilter,
    RecentPortSelected(u16),
    FilterChanged(String),
    QuickFilterSelected(QuickFilter),
    Refresh,
    RefreshFinished(Result<Vec<ConnectionInfo>, String>),
    AutoRefreshTick,
    AutoRefreshFinished(Result<Vec<ConnectionInfo>, String>),
    ToggleAutoRefresh,
    KillRequested(i32),
    KillVisibleRequested,
    ConfirmPendingKill,
    CancelPendingKill,
    KillFinished(Result<i32, String>),
    KillAllFinished(KillManyResult),
    SortBy(SortColumn),
    ResizeStarted(usize),
    ResizeMoved(f32),
    ResizeFinished,
    CheckUpdate,
    UpdateCheckFinished(Result<UpdateInfo, String>),
    InstallUpdate,
    UpdateInstallFinished(Result<(), String>),
}

#[derive(Debug, Clone, Copy)]
struct ResizeDrag {
    separator: usize,
    last_x: Option<f32>,
}

#[derive(Debug, Clone)]
struct ConnectionInfo {
    protocol: String,
    local_address: String,
    foreign_address: String,
    state: String,
    pid: i32,
    name: String,
}

#[derive(Debug, Clone)]
struct ParsedConnection {
    protocol: String,
    local_address: String,
    foreign_address: String,
    state: String,
    pid: i32,
}

#[derive(Default)]
struct ConnectionStats {
    total: usize,
    tcp: usize,
    udp: usize,
    established: usize,
    listening: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum QuickFilter {
    All,
    Listening,
    Established,
    Tcp,
    Udp,
    Localhost,
}

#[derive(Debug, Clone)]
enum PendingAction {
    Single(ConnectionInfo),
    Visible {
        pids: Vec<i32>,
        process_count: usize,
        connection_count: usize,
    },
}

#[derive(Debug, Clone)]
struct KillManyResult {
    killed_pids: Vec<i32>,
    failed: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SortColumn {
    Protocol,
    LocalAddress,
    ForeignAddress,
    State,
    Pid,
    Process,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SortDirection {
    Ascending,
    Descending,
}

#[derive(Debug, Clone)]
enum UpdateState {
    Idle,
    Checking,
    Available(UpdateInfo),
    UpToDate,
    Installing,
    Error(String),
}

#[derive(Debug, Clone)]
struct UpdateInfo {
    version: String,
    asset_name: String,
    download_url: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

impl Prockiller {
    fn boot() -> (Self, Task<Message>) {
        let app = Self {
            is_refreshing: true,
            status: "Refreshing connections...".to_string(),
            ..Self::default()
        };

        (
            app,
            Task::perform(find_connections(), Message::RefreshFinished),
        )
    }

    fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::PortFilterChanged(value) => {
                self.port_filter = sanitize_port_filter(&value);
                Task::none()
            }
            Message::RememberPortFilter => {
                if let Some(port) = parse_port_filter(&self.port_filter) {
                    self.remember_port(port);
                    self.status = format!("Showing connections on port {port}.");
                    self.push_activity(format!("Port filter set to {port}."));
                }
                Task::none()
            }
            Message::ClearPortFilter => {
                self.port_filter.clear();
                self.status = "Showing all ports.".to_string();
                self.push_activity("Port filter cleared.".to_string());
                Task::none()
            }
            Message::RecentPortSelected(port) => {
                self.port_filter = port.to_string();
                self.remember_port(port);
                self.status = format!("Showing connections on port {port}.");
                self.push_activity(format!("Recent port selected: {port}."));
                Task::none()
            }
            Message::FilterChanged(filter) => {
                self.filter = filter;
                Task::none()
            }
            Message::QuickFilterSelected(filter) => {
                self.quick_filter = filter;
                self.status = format!("Filter: {}.", quick_filter_label(filter));
                Task::none()
            }
            Message::Refresh => {
                if self.is_refreshing {
                    return Task::none();
                }

                self.is_refreshing = true;
                self.status = "Refreshing connections...".to_string();
                self.push_activity("Manual refresh started.".to_string());

                Task::perform(find_connections(), Message::RefreshFinished)
            }
            Message::RefreshFinished(result) => {
                self.is_refreshing = false;

                match result {
                    Ok(connections) => {
                        self.status = format!("Loaded {} connection(s).", connections.len());
                        self.push_activity(self.status.clone());
                        self.connections = connections;
                    }
                    Err(error) => {
                        self.status = error;
                        self.push_activity(format!("Refresh failed: {}", self.status));
                    }
                }

                Task::none()
            }
            Message::AutoRefreshTick => {
                if self.is_refreshing || self.is_busy {
                    return Task::none();
                }

                self.is_refreshing = true;
                Task::perform(find_connections(), Message::AutoRefreshFinished)
            }
            Message::AutoRefreshFinished(result) => {
                self.is_refreshing = false;

                match result {
                    Ok(connections) => {
                        self.status = format!("Loaded {} connection(s).", connections.len());
                        self.push_activity(self.status.clone());
                        self.connections = connections;
                    }
                    Err(error) => {
                        self.status = format!("Auto refresh failed: {error}");
                        self.push_activity(self.status.clone());
                    }
                }

                Task::none()
            }
            Message::ToggleAutoRefresh => {
                self.auto_refresh_enabled = !self.auto_refresh_enabled;
                self.status = if self.auto_refresh_enabled {
                    "Auto refresh enabled.".to_string()
                } else {
                    "Auto refresh paused.".to_string()
                };
                self.push_activity(self.status.clone());
                Task::none()
            }
            Message::KillRequested(pid) => {
                if self.is_busy {
                    return Task::none();
                }

                if let Some(connection) = self
                    .connections
                    .iter()
                    .find(|connection| connection.pid == pid)
                {
                    self.pending_action = Some(PendingAction::Single(connection.clone()));
                    self.status = format!("Confirm termination of {} ({pid}).", connection.name);
                }

                Task::none()
            }
            Message::KillVisibleRequested => {
                if self.is_busy {
                    return Task::none();
                }

                let visible_connections = self.filtered_connections();
                let pids = visible_connections
                    .iter()
                    .map(|connection| connection.pid)
                    .filter(|pid| *pid > 0)
                    .collect::<HashSet<_>>()
                    .into_iter()
                    .collect::<Vec<_>>();

                if pids.is_empty() {
                    return Task::none();
                }

                self.pending_action = Some(PendingAction::Visible {
                    pids,
                    process_count: visible_connections
                        .iter()
                        .map(|connection| connection.pid)
                        .collect::<HashSet<_>>()
                        .len(),
                    connection_count: visible_connections.len(),
                });
                self.status = "Confirm termination of visible processes.".to_string();
                Task::none()
            }
            Message::ConfirmPendingKill => {
                let Some(action) = self.pending_action.take() else {
                    return Task::none();
                };

                self.is_busy = true;

                match action {
                    PendingAction::Single(connection) => {
                        self.status =
                            format!("Killing {} ({})...", connection.name, connection.pid);
                        self.push_activity(self.status.clone());
                        Task::perform(kill_process(connection.pid), Message::KillFinished)
                    }
                    PendingAction::Visible { pids, .. } => {
                        self.status = format!("Killing {} visible process(es)...", pids.len());
                        self.push_activity(self.status.clone());
                        Task::perform(kill_all_processes(pids), Message::KillAllFinished)
                    }
                }
            }
            Message::CancelPendingKill => {
                self.pending_action = None;
                self.status = "Kill cancelled.".to_string();
                self.push_activity(self.status.clone());
                Task::none()
            }
            Message::KillFinished(result) => {
                self.is_busy = false;

                match result {
                    Ok(pid) => {
                        self.connections.retain(|connection| connection.pid != pid);
                        self.status = format!("Process {pid} terminated.");
                        self.push_activity(self.status.clone());
                    }
                    Err(error) => {
                        self.status = error;
                        self.push_activity(format!("Kill failed: {}", self.status));
                    }
                }

                Task::none()
            }
            Message::KillAllFinished(result) => {
                self.is_busy = false;

                if !result.killed_pids.is_empty() {
                    self.connections
                        .retain(|connection| !result.killed_pids.contains(&connection.pid));
                }

                self.status = match (result.killed_pids.len(), result.failed.len()) {
                    (0, 0) => "No processes were terminated.".to_string(),
                    (killed, 0) => format!("Killed {killed} process(es)."),
                    (0, failed) => {
                        format!(
                            "Failed to kill {failed} process(es): {}",
                            result.failed.join("; ")
                        )
                    }
                    (killed, failed) => format!(
                        "Killed {killed}, failed {failed}: {}",
                        result
                            .failed
                            .iter()
                            .take(2)
                            .cloned()
                            .collect::<Vec<_>>()
                            .join("; ")
                    ),
                };
                self.push_activity(self.status.clone());

                Task::none()
            }
            Message::SortBy(column) => {
                if self.sort_column == column {
                    self.sort_direction = match self.sort_direction {
                        SortDirection::Ascending => SortDirection::Descending,
                        SortDirection::Descending => SortDirection::Ascending,
                    };
                } else {
                    self.sort_column = column;
                    self.sort_direction = SortDirection::Ascending;
                }

                Task::none()
            }
            Message::ResizeStarted(separator) => {
                self.resize_drag = Some(ResizeDrag {
                    separator,
                    last_x: None,
                });
                Task::none()
            }
            Message::ResizeMoved(x) => {
                if let Some(drag) = self.resize_drag {
                    let Some(last_x) = drag.last_x else {
                        self.resize_drag = Some(ResizeDrag {
                            separator: drag.separator,
                            last_x: Some(x),
                        });
                        return Task::none();
                    };

                    let delta = x - last_x;
                    let steps = (delta / RESIZE_STEP_PX).trunc() as i16;

                    if steps != 0 {
                        self.resize_drag = Some(ResizeDrag {
                            separator: drag.separator,
                            last_x: Some(last_x + (steps as f32 * RESIZE_STEP_PX)),
                        });
                        resize_columns(&mut self.column_units, drag.separator, steps);
                    }
                }

                Task::none()
            }
            Message::ResizeFinished => {
                self.resize_drag = None;
                Task::none()
            }
            Message::CheckUpdate => {
                self.update = UpdateState::Checking;
                Task::perform(check_for_update(), Message::UpdateCheckFinished)
            }
            Message::UpdateCheckFinished(result) => {
                match result {
                    Ok(info) if is_newer_version(CURRENT_VERSION, &info.version) => {
                        self.status = format!("Update {} is available.", info.version);
                        self.update = UpdateState::Available(info);
                    }
                    Ok(_) => {
                        self.status = format!("Prockiller {CURRENT_VERSION} is up to date.");
                        self.update = UpdateState::UpToDate;
                    }
                    Err(error) => {
                        self.status = format!("Update check failed: {error}");
                        self.update = UpdateState::Error(error);
                    }
                }

                Task::none()
            }
            Message::InstallUpdate => {
                if let UpdateState::Available(info) = self.update.clone() {
                    self.update = UpdateState::Installing;
                    self.status = format!("Downloading Prockiller {}...", info.version);
                    Task::perform(install_update(info), Message::UpdateInstallFinished)
                } else {
                    Task::none()
                }
            }
            Message::UpdateInstallFinished(result) => match result {
                Ok(()) => {
                    std::process::exit(0);
                }
                Err(error) => {
                    self.status = format!("Update failed: {error}");
                    self.update = UpdateState::Error(error);
                    Task::none()
                }
            },
        }
    }

    fn subscription(&self) -> Subscription<Message> {
        let mut subscriptions = Vec::new();

        if self.resize_drag.is_some() {
            subscriptions.push(event::listen_with(|event, _status, _window| match event {
                iced::Event::Mouse(mouse::Event::CursorMoved { position }) => {
                    Some(Message::ResizeMoved(position.x))
                }
                iced::Event::Mouse(mouse::Event::ButtonReleased(mouse::Button::Left)) => {
                    Some(Message::ResizeFinished)
                }
                _ => None,
            }));
        }

        if self.auto_refresh_enabled {
            subscriptions
                .push(time::every(AUTO_REFRESH_INTERVAL).map(|_| Message::AutoRefreshTick));
        }

        subscriptions.push(event::listen_with(|event, _status, _window| match event {
            iced::Event::Keyboard(keyboard::Event::KeyPressed {
                key: keyboard::Key::Named(key::Named::F5),
                repeat: false,
                ..
            }) => Some(Message::Refresh),
            _ => None,
        }));

        Subscription::batch(subscriptions)
    }

    fn view(&self) -> Element<'_, Message> {
        let refresh_button = if self.is_refreshing {
            button("Refresh")
        } else {
            button("Refresh").on_press(Message::Refresh)
        };

        let auto_refresh_button = if self.auto_refresh_enabled {
            button("Auto 5s")
                .on_press(Message::ToggleAutoRefresh)
                .style(gruvbox_button)
        } else {
            button("Auto off")
                .on_press(Message::ToggleAutoRefresh)
                .style(gruvbox_button)
        };

        let filtered_connections = self.filtered_connections();
        let stats = connection_stats(&self.connections);
        let visible_stats = connection_stats(
            &filtered_connections
                .iter()
                .map(|connection| (*connection).clone())
                .collect::<Vec<_>>(),
        );
        let summary = format!(
            "Visible:{} / {}  TCP:{} UDP:{} LISTEN:{}",
            filtered_connections.len(),
            stats.total,
            visible_stats.tcp,
            visible_stats.udp,
            visible_stats.listening
        );

        let kill_all_button = if self.is_busy || filtered_connections.is_empty() {
            button("Kill visible")
        } else {
            button("Kill visible")
                .on_press(Message::KillVisibleRequested)
                .style(gruvbox_button)
        };

        let update_button = match &self.update {
            UpdateState::Checking => button("Checking..."),
            UpdateState::Installing => button("Installing..."),
            UpdateState::Available(_) => button("Install update")
                .on_press(Message::InstallUpdate)
                .style(gruvbox_button),
            _ => button("Check update")
                .on_press(Message::CheckUpdate)
                .style(gruvbox_button),
        };

        let update_text = match &self.update {
            UpdateState::Available(info) => {
                format!("v{} available ({})", info.version, info.asset_name)
            }
            UpdateState::UpToDate => format!("v{CURRENT_VERSION} current"),
            UpdateState::Checking => "checking updates".to_string(),
            UpdateState::Installing => "installing update".to_string(),
            UpdateState::Error(error) => format!("update error: {error}"),
            UpdateState::Idle => format!("v{CURRENT_VERSION}"),
        };

        let title_row = row![
            text("Prockiller").size(24).width(Length::Fixed(160.0)),
            text_input("Port", &self.port_filter)
                .on_input(Message::PortFilterChanged)
                .on_submit(Message::RememberPortFilter)
                .padding(6)
                .size(15)
                .style(gruvbox_text_input)
                .width(Length::Fixed(96.0)),
            button("All ports").on_press(Message::ClearPortFilter),
            text_input("Search process, PID, address, or state", &self.filter)
                .on_input(Message::FilterChanged)
                .padding(6)
                .size(15)
                .style(gruvbox_text_input)
                .width(Length::Fill),
            refresh_button,
            auto_refresh_button,
            update_button,
        ]
        .spacing(8)
        .align_y(Alignment::Center);

        let filter_row = row![
            text("Show").size(14).width(Length::Fixed(44.0)),
            filter_chip(QuickFilter::All, self.quick_filter),
            filter_chip(QuickFilter::Listening, self.quick_filter),
            filter_chip(QuickFilter::Established, self.quick_filter),
            filter_chip(QuickFilter::Tcp, self.quick_filter),
            filter_chip(QuickFilter::Udp, self.quick_filter),
            filter_chip(QuickFilter::Localhost, self.quick_filter),
            kill_all_button,
            text(summary).size(14).width(Length::Fill),
        ]
        .spacing(6)
        .align_y(Alignment::Center);

        let mut controls = column![title_row, filter_row]
            .spacing(6)
            .width(Length::Fill);

        if !self.recent_ports.is_empty() {
            let mut recent_row = row![text("Recent").size(13).width(Length::Fixed(44.0))]
                .spacing(6)
                .align_y(Alignment::Center);

            for port in &self.recent_ports {
                recent_row = recent_row.push(
                    button(text(port.to_string()))
                        .on_press(Message::RecentPortSelected(*port))
                        .style(gruvbox_button),
                );
            }

            controls = controls.push(recent_row);
        }

        let status_bar = row![
            text(update_text)
                .size(13)
                .wrapping(Wrapping::None)
                .width(Length::Fill),
            text(&self.status)
                .size(13)
                .wrapping(Wrapping::None)
                .align_x(iced::alignment::Horizontal::Right)
                .width(Length::Fill),
        ]
        .spacing(14)
        .padding([5, 10])
        .align_y(Alignment::Center);

        let status_bar = container(status_bar)
            .style(|_| gruvbox_container(GB_BG0, Some(GB_FG1), GB_BG0))
            .width(Length::Fill);

        let status_divider = container(text(""))
            .height(Length::Fixed(1.0))
            .width(Length::Fill)
            .style(|_| gruvbox_container(GB_BG2, None, GB_BG2));

        let header = row![
            sort_header(
                "Proto",
                SortColumn::Protocol,
                self.sort_column,
                self.sort_direction
            )
            .width(Length::FillPortion(self.column_units[0])),
            resize_handle(0),
            sort_header(
                "Local Address",
                SortColumn::LocalAddress,
                self.sort_column,
                self.sort_direction
            )
            .width(Length::FillPortion(self.column_units[1])),
            resize_handle(1),
            sort_header(
                "Foreign Address",
                SortColumn::ForeignAddress,
                self.sort_column,
                self.sort_direction
            )
            .width(Length::FillPortion(self.column_units[2])),
            resize_handle(2),
            sort_header(
                "State",
                SortColumn::State,
                self.sort_column,
                self.sort_direction
            )
            .width(Length::FillPortion(self.column_units[3])),
            resize_handle(3),
            sort_header(
                "PID",
                SortColumn::Pid,
                self.sort_column,
                self.sort_direction
            )
            .width(Length::FillPortion(self.column_units[4])),
            resize_handle(4),
            sort_header(
                "Process",
                SortColumn::Process,
                self.sort_column,
                self.sort_direction
            )
            .width(Length::FillPortion(self.column_units[5])),
            container(text("")).width(Length::Fixed(ACTION_COLUMN_WIDTH + ACTION_GUTTER_WIDTH)),
        ]
        .spacing(4)
        .padding([4, 10])
        .height(Length::Fixed(HEADER_HEIGHT));

        let header =
            container(header).style(|_| gruvbox_container(GB_BG0_HARD, Some(GB_FG0), GB_BG2));

        let connection_rows = filtered_connections.into_iter().enumerate().fold(
            column![].spacing(1),
            |list, (index, connection)| {
                list.push(
                    container(
                        row![
                            cell(
                                &connection.protocol,
                                Length::FillPortion(self.column_units[0])
                            ),
                            container(text("")).width(Length::Fixed(6.0)),
                            cell(
                                &connection.local_address,
                                Length::FillPortion(self.column_units[1])
                            ),
                            container(text("")).width(Length::Fixed(6.0)),
                            cell(
                                &connection.foreign_address,
                                Length::FillPortion(self.column_units[2])
                            ),
                            container(text("")).width(Length::Fixed(6.0)),
                            cell(&connection.state, Length::FillPortion(self.column_units[3])),
                            container(text("")).width(Length::Fixed(6.0)),
                            cell(
                                connection.pid.to_string(),
                                Length::FillPortion(self.column_units[4])
                            ),
                            container(text("")).width(Length::Fixed(6.0)),
                            cell(&connection.name, Length::FillPortion(self.column_units[5])),
                            kill_button(
                                connection.pid,
                                self.is_busy || self.pending_action.is_some()
                            )
                            .width(Length::Fixed(ACTION_COLUMN_WIDTH)),
                            container(text("")).width(Length::Fixed(ACTION_GUTTER_WIDTH)),
                        ]
                        .spacing(4)
                        .padding([3, 10])
                        .align_y(Alignment::Center),
                    )
                    .style(move |_| {
                        let background = if index % 2 == 0 { GB_BG0 } else { GB_BG0_SOFT };
                        gruvbox_container(background, Some(GB_FG1), GB_BG1)
                    }),
                )
            },
        );

        let table = scrollable(connection_rows)
            .direction(Direction::Vertical(
                Scrollbar::new().width(10).scroller_width(10),
            ))
            .height(Length::Fill)
            .width(Length::Fill);

        let mut content = column![controls, header, table]
            .spacing(6)
            .padding(Padding {
                top: 8.0,
                right: 8.0,
                bottom: 6.0,
                left: 8.0,
            })
            .height(Length::Fill);

        if let Some(action) = &self.pending_action {
            content = content.push(confirmation_panel(action));
        }

        if !self.activity.is_empty() {
            content = content.push(activity_panel(&self.activity));
        }

        let content = content.push(status_divider).push(status_bar);

        container(content)
            .width(Length::Fill)
            .height(Length::Fill)
            .style(|_| gruvbox_container(GB_BG0, Some(GB_FG1), GB_BG0))
            .into()
    }

    fn filtered_connections(&self) -> Vec<&ConnectionInfo> {
        let query = self.filter.trim().to_lowercase();
        let port = parse_port_filter(&self.port_filter);

        let mut connections = self
            .connections
            .iter()
            .filter(|connection| {
                let port_matches = port
                    .map(|port| read_port(&connection.local_address) == Some(port))
                    .unwrap_or(true);
                let quick_filter_matches = matches_quick_filter(connection, self.quick_filter);
                let query_matches = query.is_empty()
                    || connection.protocol.to_lowercase().contains(&query)
                    || connection.local_address.to_lowercase().contains(&query)
                    || connection.foreign_address.to_lowercase().contains(&query)
                    || connection.state.to_lowercase().contains(&query)
                    || connection.name.to_lowercase().contains(&query)
                    || connection.pid.to_string().contains(&query);

                port_matches && quick_filter_matches && query_matches
            })
            .collect::<Vec<_>>();

        sort_connections(&mut connections, self.sort_column, self.sort_direction);
        connections
    }

    fn remember_port(&mut self, port: u16) {
        self.recent_ports.retain(|recent_port| *recent_port != port);
        self.recent_ports.insert(0, port);
        self.recent_ports.truncate(6);
    }

    fn push_activity(&mut self, message: String) {
        self.activity.insert(0, message);
        self.activity.truncate(4);
    }
}

fn sort_header<'a>(
    label: &str,
    column: SortColumn,
    active_column: SortColumn,
    direction: SortDirection,
) -> iced::widget::Button<'a, Message> {
    let suffix = if column == active_column {
        match direction {
            SortDirection::Ascending => " ↑",
            SortDirection::Descending => " ↓",
        }
    } else {
        ""
    };

    button(text(format!("{label}{suffix}")).size(14))
        .on_press(Message::SortBy(column))
        .style(gruvbox_header_button)
}

fn sanitize_port_filter(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_digit())
        .take(5)
        .collect()
}

fn parse_port_filter(value: &str) -> Option<u16> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    trimmed
        .parse::<u16>()
        .ok()
        .filter(|port| (1..=65535).contains(port))
}

fn matches_quick_filter(connection: &ConnectionInfo, filter: QuickFilter) -> bool {
    match filter {
        QuickFilter::All => true,
        QuickFilter::Listening => connection.state == "LISTENING",
        QuickFilter::Established => connection.state == "ESTABLISHED",
        QuickFilter::Tcp => connection.protocol.starts_with("TCP"),
        QuickFilter::Udp => connection.protocol.starts_with("UDP"),
        QuickFilter::Localhost => {
            connection.local_address.starts_with("127.")
                || connection.local_address.starts_with("[::1]")
                || connection.local_address.starts_with("localhost")
                || connection.local_address.starts_with("0.0.0.0")
                || connection.local_address.starts_with("[::]")
        }
    }
}

fn quick_filter_label(filter: QuickFilter) -> &'static str {
    match filter {
        QuickFilter::All => "All",
        QuickFilter::Listening => "Listening",
        QuickFilter::Established => "Established",
        QuickFilter::Tcp => "TCP",
        QuickFilter::Udp => "UDP",
        QuickFilter::Localhost => "Local",
    }
}

fn filter_chip(
    filter: QuickFilter,
    active_filter: QuickFilter,
) -> iced::widget::Button<'static, Message> {
    let button = button(quick_filter_label(filter));

    if filter == active_filter {
        button.style(gruvbox_button)
    } else {
        button.on_press(Message::QuickFilterSelected(filter))
    }
}

fn cell_text<'a>(value: impl Into<String>) -> iced::widget::Text<'a> {
    text(value.into()).size(14).wrapping(Wrapping::None)
}

fn cell<'a>(value: impl Into<String>, width: Length) -> Element<'a, Message> {
    container(cell_text(value).width(Length::Fill))
        .width(width)
        .clip(true)
        .into()
}

fn kill_button(pid: i32, is_busy: bool) -> iced::widget::Button<'static, Message> {
    let base = button("Kill").style(gruvbox_button);

    if is_busy || pid <= 0 {
        base
    } else {
        base.on_press(Message::KillRequested(pid))
    }
}

fn confirmation_panel(action: &PendingAction) -> Element<'static, Message> {
    let details = match action {
        PendingAction::Single(connection) => format!(
            "{} ({})  {}  {} -> {}  {}",
            connection.name,
            connection.pid,
            connection.protocol,
            connection.local_address,
            connection.foreign_address,
            if connection.state.is_empty() {
                "UDP"
            } else {
                &connection.state
            }
        ),
        PendingAction::Visible {
            process_count,
            connection_count,
            ..
        } => format!(
            "Terminate {process_count} visible process(es) across {connection_count} connection(s)."
        ),
    };

    container(
        row![
            column![
                text("Confirm termination").size(16),
                text(details).size(13).wrapping(Wrapping::None),
                text("This uses taskkill /F. Run as administrator if Windows denies access.")
                    .size(12)
                    .style(|_| iced::widget::text::Style {
                        color: Some(GB_GRAY),
                    }),
            ]
            .spacing(3)
            .width(Length::Fill),
            button("Terminate")
                .on_press(Message::ConfirmPendingKill)
                .style(danger_button),
            button("Cancel").on_press(Message::CancelPendingKill),
        ]
        .spacing(10)
        .align_y(Alignment::Center)
        .padding([8, 10]),
    )
    .style(|_| gruvbox_container(GB_BG0_HARD, Some(GB_FG0), GB_RED))
    .width(Length::Fill)
    .into()
}

fn activity_panel(activity: &[String]) -> Element<'static, Message> {
    let mut log = column![text("Activity").size(13)].spacing(2);

    for entry in activity.iter().take(3) {
        log = log.push(
            text(entry.clone())
                .size(12)
                .style(|_| iced::widget::text::Style {
                    color: Some(GB_GRAY),
                }),
        );
    }

    container(log.padding([6, 10]))
        .style(|_| gruvbox_container(GB_BG0_SOFT, Some(GB_FG1), GB_BG1))
        .width(Length::Fill)
        .into()
}

fn resize_handle(index: usize) -> Element<'static, Message> {
    mouse_area(
        container(
            container(text(""))
                .width(Length::Fixed(RESIZE_LINE_WIDTH))
                .height(Length::Fixed(HEADER_HEIGHT - 10.0))
                .style(|_| gruvbox_container(GB_BG2, Some(GB_FG1), GB_BG2)),
        )
        .width(Length::Fixed(RESIZE_HANDLE_WIDTH))
        .height(Length::Fixed(HEADER_HEIGHT - 8.0))
        .center_x(Length::Fixed(RESIZE_HANDLE_WIDTH)),
    )
    .on_press(Message::ResizeStarted(index))
    .interaction(Interaction::ResizingHorizontally)
    .into()
}

fn resize_columns(columns: &mut [u16; COLUMN_COUNT], separator: usize, steps: i16) {
    if separator + 1 >= COLUMN_COUNT {
        return;
    }

    if steps > 0 {
        let available = columns[separator + 1].saturating_sub(MIN_COLUMN_UNITS);
        let applied = available.min(steps as u16);
        columns[separator] = columns[separator].saturating_add(applied);
        columns[separator + 1] = columns[separator + 1].saturating_sub(applied);
    } else if steps < 0 {
        let available = columns[separator].saturating_sub(MIN_COLUMN_UNITS);
        let applied = available.min((-steps) as u16);
        columns[separator] = columns[separator].saturating_sub(applied);
        columns[separator + 1] = columns[separator + 1].saturating_add(applied);
    }
}

fn sort_connections(
    connections: &mut [&ConnectionInfo],
    column: SortColumn,
    direction: SortDirection,
) {
    connections.sort_by(|left, right| {
        let ordering = match column {
            SortColumn::Protocol => left.protocol.cmp(&right.protocol),
            SortColumn::LocalAddress => compare_address(&left.local_address, &right.local_address),
            SortColumn::ForeignAddress => {
                compare_address(&left.foreign_address, &right.foreign_address)
            }
            SortColumn::State => left.state.cmp(&right.state),
            SortColumn::Pid => left.pid.cmp(&right.pid),
            SortColumn::Process => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
        }
        .then_with(|| left.pid.cmp(&right.pid))
        .then_with(|| left.local_address.cmp(&right.local_address));

        match direction {
            SortDirection::Ascending => ordering,
            SortDirection::Descending => ordering.reverse(),
        }
    });
}

fn compare_address(left: &str, right: &str) -> std::cmp::Ordering {
    read_port(left)
        .cmp(&read_port(right))
        .then_with(|| left.cmp(right))
}

async fn find_connections() -> Result<Vec<ConnectionInfo>, String> {
    let output = hidden_command("netstat")
        .arg("-ano")
        .output()
        .map_err(|error| format!("Failed to run netstat: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let process_names = get_process_names();
    let mut connections = Vec::new();
    let mut seen_connections = HashSet::new();

    for line in stdout.lines() {
        let Some(connection) = parse_netstat_line(line) else {
            continue;
        };

        let name = process_names
            .get(&connection.pid)
            .cloned()
            .unwrap_or_else(|| "Unknown".to_string());

        let key = (
            connection.protocol.clone(),
            connection.local_address.clone(),
            connection.foreign_address.clone(),
            connection.state.clone(),
            connection.pid,
            name.clone(),
        );

        if !seen_connections.insert(key) {
            continue;
        }

        connections.push(ConnectionInfo {
            protocol: connection.protocol,
            local_address: connection.local_address,
            foreign_address: connection.foreign_address,
            state: connection.state,
            pid: connection.pid,
            name,
        });
    }

    connections.sort_by(|left, right| {
        read_port(&left.local_address)
            .cmp(&read_port(&right.local_address))
            .then_with(|| left.protocol.cmp(&right.protocol))
            .then_with(|| left.local_address.cmp(&right.local_address))
    });

    Ok(connections)
}

async fn kill_process(pid: i32) -> Result<i32, String> {
    kill_pid(pid).map(|_| pid)
}

async fn kill_all_processes(pids: Vec<i32>) -> KillManyResult {
    let mut killed_pids = Vec::new();
    let mut failed = Vec::new();

    for pid in pids {
        match kill_pid(pid) {
            Ok(()) => killed_pids.push(pid),
            Err(error) => failed.push(format!("{pid}: {error}")),
        }
    }

    KillManyResult {
        killed_pids,
        failed,
    }
}

fn kill_pid(pid: i32) -> Result<(), String> {
    let output = hidden_command("taskkill")
        .args(["/PID", &pid.to_string(), "/F"])
        .output()
        .map_err(|error| format!("Failed to run taskkill: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let message = String::from_utf8_lossy(&output.stderr);
    if message.contains("Access is denied") {
        return Err("Permission denied. Run Prockiller as administrator.".to_string());
    }

    Err(format!("Failed to kill process {pid}: {}", message.trim()))
}

fn get_process_names() -> HashMap<i32, String> {
    let output = hidden_command("tasklist")
        .args(["/FO", "CSV", "/NH"])
        .output();

    let Ok(output) = output else {
        return HashMap::new();
    };

    if !output.status.success() {
        return HashMap::new();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut names = HashMap::new();

    for line in stdout.lines() {
        if let Some((name, pid)) = parse_tasklist_line(line) {
            names.insert(pid, name);
        }
    }

    names
}

fn parse_tasklist_line(line: &str) -> Option<(String, i32)> {
    let fields = csv_fields(line);
    let name = fields.first()?.to_string();
    let pid = fields.get(1)?.parse::<i32>().ok()?;

    Some((name, pid))
}

fn csv_fields(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '"' if in_quotes && chars.peek() == Some(&'"') => {
                field.push('"');
                chars.next();
            }
            '"' => {
                in_quotes = !in_quotes;
            }
            ',' if !in_quotes => {
                fields.push(field.trim().to_string());
                field.clear();
            }
            _ => field.push(ch),
        }
    }

    fields.push(field.trim().to_string());
    fields
}

fn parse_netstat_line(line: &str) -> Option<ParsedConnection> {
    let parts = line.split_whitespace().collect::<Vec<_>>();
    if parts.len() < 4 {
        return None;
    }

    let protocol = parts[0].to_uppercase();
    if protocol != "TCP" && protocol != "UDP" {
        return None;
    }

    let local_address = parts[1].to_string();
    let foreign_address = parts[2].to_string();

    let (state, pid_part) = if protocol == "TCP" {
        (
            parts.get(3).copied().unwrap_or("").to_string(),
            parts.last()?,
        )
    } else {
        (String::new(), parts.last()?)
    };

    let pid = pid_part.parse::<i32>().ok()?;
    if pid <= 0 {
        return None;
    }

    Some(ParsedConnection {
        protocol: format!("{}{}", protocol, address_family_suffix(&local_address)),
        local_address,
        foreign_address,
        state,
        pid,
    })
}

fn read_port(local_address: &str) -> Option<u16> {
    local_address
        .rsplit_once(':')
        .and_then(|(_, port)| port.parse::<u16>().ok())
}

fn address_family_suffix(local_address: &str) -> &'static str {
    if local_address.contains('[') {
        "v6"
    } else {
        "v4"
    }
}

fn connection_stats(connections: &[ConnectionInfo]) -> ConnectionStats {
    let mut stats = ConnectionStats {
        total: connections.len(),
        ..ConnectionStats::default()
    };

    for connection in connections {
        if connection.protocol.starts_with("TCP") {
            stats.tcp += 1;
        } else if connection.protocol.starts_with("UDP") {
            stats.udp += 1;
        }

        match connection.state.as_str() {
            "ESTABLISHED" => stats.established += 1,
            "LISTENING" => stats.listening += 1,
            _ => {}
        }
    }

    stats
}

async fn check_for_update() -> Result<UpdateInfo, String> {
    let release = reqwest::Client::new()
        .get(RELEASE_API_URL)
        .header("User-Agent", "prockiller-iced")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<GithubRelease>()
        .await
        .map_err(|error| error.to_string())?;

    let version = normalize_version(&release.tag_name);
    let asset = release
        .assets
        .into_iter()
        .find(|asset| {
            let name = asset.name.to_lowercase();
            name.ends_with(".exe")
                && (name.contains("prockiller-iced")
                    || name.contains("prockiller")
                    || name.contains("win"))
        })
        .ok_or_else(|| "Latest release does not include a Windows executable asset.".to_string())?;

    Ok(UpdateInfo {
        version,
        asset_name: asset.name,
        download_url: asset.browser_download_url,
    })
}

async fn install_update(info: UpdateInfo) -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let temp_dir = std::env::temp_dir().join("prockiller-update");
    fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;

    let download_path = temp_dir.join("prockiller-iced.new.exe");
    let script_path = temp_dir.join("install-prockiller-update.ps1");

    let bytes = reqwest::Client::new()
        .get(&info.download_url)
        .header("User-Agent", "prockiller-iced")
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .bytes()
        .await
        .map_err(|error| error.to_string())?;

    fs::write(&download_path, &bytes).map_err(|error| error.to_string())?;
    write_update_script(&script_path, &download_path, &current_exe)?;

    let current_pid = std::process::id().to_string();
    hidden_command("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            script_path.to_string_lossy().as_ref(),
            "-Pid",
            &current_pid,
            "-Source",
            download_path.to_string_lossy().as_ref(),
            "-Target",
            current_exe.to_string_lossy().as_ref(),
        ])
        .spawn()
        .map_err(|error| error.to_string())?;

    Ok(())
}

fn write_update_script(
    script_path: &Path,
    download_path: &Path,
    current_exe: &Path,
) -> Result<(), String> {
    let script = r#"
param(
  [Parameter(Mandatory=$true)][int]$Pid,
  [Parameter(Mandatory=$true)][string]$Source,
  [Parameter(Mandatory=$true)][string]$Target
)

$ErrorActionPreference = 'Stop'
Wait-Process -Id $Pid -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300
Copy-Item -LiteralPath $Source -Destination $Target -Force
Start-Process -FilePath $Target
Remove-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
"#
    .to_string();

    fs::write(script_path, script).map_err(|error| {
        format!(
            "Failed to write updater script for {} from {}: {error}",
            current_exe.display(),
            download_path.display()
        )
    })
}

fn normalize_version(version: &str) -> String {
    version
        .trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .to_string()
}

fn is_newer_version(current: &str, latest: &str) -> bool {
    let current_parts = version_parts(current);
    let latest_parts = version_parts(latest);

    for index in 0..3 {
        let current_part = current_parts.get(index).copied().unwrap_or(0);
        let latest_part = latest_parts.get(index).copied().unwrap_or(0);

        if latest_part > current_part {
            return true;
        }

        if latest_part < current_part {
            return false;
        }
    }

    false
}

fn version_parts(version: &str) -> Vec<u64> {
    normalize_version(version)
        .split('.')
        .map(|part| {
            part.chars()
                .take_while(|ch| ch.is_ascii_digit())
                .collect::<String>()
                .parse::<u64>()
                .unwrap_or(0)
        })
        .collect()
}

fn hidden_command(program: &str) -> Command {
    let mut command = Command::new(program);

    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

const GB_BG0_HARD: Color = Color::from_rgb(0.11372549, 0.1254902, 0.12941177);
const GB_BG0: Color = Color::from_rgb(0.15686275, 0.15686275, 0.15686275);
const GB_BG0_SOFT: Color = Color::from_rgb(0.19607843, 0.1882353, 0.18431373);
const GB_BG1: Color = Color::from_rgb(0.23529412, 0.21960784, 0.21176471);
const GB_BG2: Color = Color::from_rgb(0.3137255, 0.2901961, 0.27450982);
const GB_FG0: Color = Color::from_rgb(0.9843137, 0.94509804, 0.78039217);
const GB_FG1: Color = Color::from_rgb(0.92156863, 0.85882354, 0.69803923);
const GB_GRAY: Color = Color::from_rgb(0.57254905, 0.5137255, 0.45490196);
const GB_ORANGE: Color = Color::from_rgb(0.99607843, 0.5019608, 0.09803922);
const GB_ORANGE_DIM: Color = Color::from_rgb(0.8392157, 0.3647059, 0.05490196);
const GB_RED: Color = Color::from_rgb(0.8, 0.14117648, 0.11372549);

fn gruvbox_container(
    background: Color,
    text_color: Option<Color>,
    border_color: Color,
) -> iced::widget::container::Style {
    iced::widget::container::Style {
        text_color,
        background: Some(Background::Color(background)),
        border: Border {
            radius: 0.0.into(),
            width: 1.0,
            color: border_color,
        },
        shadow: Shadow::default(),
        snap: true,
    }
}

fn gruvbox_button(
    _theme: &Theme,
    status: iced::widget::button::Status,
) -> iced::widget::button::Style {
    let background = match status {
        iced::widget::button::Status::Hovered => GB_ORANGE,
        iced::widget::button::Status::Pressed => GB_ORANGE_DIM,
        iced::widget::button::Status::Disabled => GB_BG1,
        iced::widget::button::Status::Active => GB_BG2,
    };

    let text_color = match status {
        iced::widget::button::Status::Hovered | iced::widget::button::Status::Pressed => {
            GB_BG0_HARD
        }
        iced::widget::button::Status::Disabled => GB_GRAY,
        iced::widget::button::Status::Active => GB_FG1,
    };

    iced::widget::button::Style {
        background: Some(Background::Color(background)),
        text_color,
        border: Border {
            radius: 2.0.into(),
            width: 1.0,
            color: match status {
                iced::widget::button::Status::Hovered | iced::widget::button::Status::Pressed => {
                    GB_ORANGE_DIM
                }
                iced::widget::button::Status::Disabled | iced::widget::button::Status::Active => {
                    GB_BG2
                }
            },
        },
        shadow: Shadow::default(),
        snap: true,
    }
}

fn danger_button(
    _theme: &Theme,
    status: iced::widget::button::Status,
) -> iced::widget::button::Style {
    let background = match status {
        iced::widget::button::Status::Hovered => GB_RED,
        iced::widget::button::Status::Pressed => Color::from_rgb(0.6313726, 0.12156863, 0.09411765),
        iced::widget::button::Status::Disabled => GB_BG1,
        iced::widget::button::Status::Active => GB_BG2,
    };

    let text_color = match status {
        iced::widget::button::Status::Hovered | iced::widget::button::Status::Pressed => GB_FG0,
        iced::widget::button::Status::Disabled => GB_GRAY,
        iced::widget::button::Status::Active => GB_FG1,
    };

    iced::widget::button::Style {
        background: Some(Background::Color(background)),
        text_color,
        border: Border {
            radius: 2.0.into(),
            width: 1.0,
            color: GB_RED,
        },
        shadow: Shadow::default(),
        snap: true,
    }
}

fn gruvbox_header_button(
    _theme: &Theme,
    status: iced::widget::button::Status,
) -> iced::widget::button::Style {
    let background = match status {
        iced::widget::button::Status::Hovered => GB_BG2,
        iced::widget::button::Status::Pressed => GB_BG1,
        iced::widget::button::Status::Disabled | iced::widget::button::Status::Active => {
            GB_BG0_HARD
        }
    };

    iced::widget::button::Style {
        background: Some(Background::Color(background)),
        text_color: GB_FG0,
        border: Border {
            radius: 0.0.into(),
            width: 0.0,
            color: background,
        },
        shadow: Shadow::default(),
        snap: true,
    }
}

fn gruvbox_text_input(
    _theme: &Theme,
    status: iced::widget::text_input::Status,
) -> iced::widget::text_input::Style {
    let border_color = match status {
        iced::widget::text_input::Status::Focused { .. } => GB_ORANGE,
        iced::widget::text_input::Status::Hovered => GB_FG1,
        iced::widget::text_input::Status::Active => GB_BG2,
        iced::widget::text_input::Status::Disabled => GB_BG1,
    };

    iced::widget::text_input::Style {
        background: Background::Color(GB_BG0_HARD),
        border: Border {
            radius: 2.0.into(),
            width: 1.0,
            color: border_color,
        },
        icon: GB_ORANGE,
        placeholder: GB_GRAY,
        value: GB_FG0,
        selection: GB_ORANGE_DIM,
    }
}
