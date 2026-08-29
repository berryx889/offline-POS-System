# Chromebook build and installation

CounterTop POS runs on supported Chromebooks through ChromeOS's Linux development
environment. The app remains offline and stores its SQLite database inside that
Linux environment.

## Build the package on GitHub

1. Open the repository on GitHub and select **Actions**.
2. Select **Build Chromebook packages**.
3. Select **Run workflow**, keep `main`, then confirm **Run workflow**.
4. Wait for both build jobs to finish.
5. Open the completed workflow run and download the artifact for the Chromebook:
   - `countertop-pos-chromebook-x86_64` for an Intel or AMD Chromebook.
   - `countertop-pos-chromebook-arm64` for an ARM Chromebook.
6. Unzip the downloaded artifact to get the `.deb` installer.

The workflow can also be triggered by pushing a tag beginning with
`chromebook-v`, such as `chromebook-v0.1.0`.

## Install on the Chromebook

1. Open ChromeOS **Settings → About ChromeOS → Diagnostics** and note whether the
   CPU is Intel/AMD or ARM.
2. Open **Settings → Advanced → Developers** and enable **Linux development
   environment**. This option may be unavailable on a managed Chromebook.
3. Copy the matching `.deb` file into **Linux files** in the Files app.
4. Double-click the `.deb` file and select **Install**.
5. Open **CounterTop POS** from the ChromeOS launcher.

The first launch creates a new local POS database. Browser-preview data is not
copied into the installed app because the preview and installed application use
different storage.

## Printing limitation

Raw ESC/POS USB printing currently uses the Windows spooler and is not available
in this Linux build. Use the app's HTML/system-print fallback or a printer that
ChromeOS can reach through its normal printing system. Confirm receipt printing
on the intended Chromebook and printer before using the app for live sales.

## Updating

Run the GitHub workflow again after a version change, download the new package,
and install it over the existing version. Back up the POS database before every
upgrade.
