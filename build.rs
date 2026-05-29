#[cfg(windows)]
fn main() {
    winresource::WindowsResource::new()
        .set_icon("icon.ico")
        .set("FileDescription", "Prockiller")
        .set("ProductName", "Prockiller")
        .compile()
        .expect("failed to compile Windows resources");
}

#[cfg(not(windows))]
fn main() {}
