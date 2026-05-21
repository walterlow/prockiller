# Prockiller Iced

Rust + iced desktop port of Prockiller.

## Build

Install Rust first:

```powershell
winget install Rustlang.Rustup
```

Then build:

```powershell
cd Prockiller.Iced
cargo build --release
```

Output:

```text
target\release\prockiller-iced.exe
```

Unlike the WinUI publish output, this should be close to a single executable. iced may still require graphics/runtime DLLs depending on the chosen renderer and target, but it should be dramatically smaller than the WinUI self-contained folder.
