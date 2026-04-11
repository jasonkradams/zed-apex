use std::{env, fs, path::PathBuf};
use zed_extension_api::{
    self as zed, Architecture, DownloadedFileType, LanguageServerId, Os,
    LanguageServerInstallationStatus, Result,
    settings::LspSettings,
};

const APEX_LSP_MAIN_CLASS: &str = "apex.jorje.lsp.ApexLanguageServerLauncher";
const APEX_LSP_JAR_PATH: &str = "extension/dist/apex-jorje-lsp.jar";
const APEX_LSP_INSTALL_DIR: &str = "apex-lsp";

const CORRETTO_REPO: &str = "corretto/corretto-21";
const JDK_INSTALL_DIR: &str = "jdk";

struct ApexExtension {
    cached_jar_path: Option<String>,
    cached_java_path: Option<String>,
}

impl ApexExtension {
    fn install_jdk(&mut self, language_server_id: &LanguageServerId) -> Result<String> {
        if let Some(path) = &self.cached_java_path {
            if fs::metadata(path).is_ok_and(|m| m.is_file()) {
                return Ok(path.clone());
            }
        }

        let jdk_dir = env::current_dir()
            .map_err(|e| format!("failed to get current directory: {e}"))?
            .join(JDK_INSTALL_DIR);

        zed::set_language_server_installation_status(
            language_server_id,
            &LanguageServerInstallationStatus::CheckingForUpdate,
        );

        let release = zed::latest_github_release(
            CORRETTO_REPO,
            zed::GithubReleaseOptions {
                require_assets: false,
                pre_release: false,
            },
        )?;

        let version = &release.version;
        let install_path = jdk_dir.join(version);

        if !install_path.exists() {
            zed::set_language_server_installation_status(
                language_server_id,
                &LanguageServerInstallationStatus::Downloading,
            );

            let (platform, arch) = zed::current_platform();
            let arch_str = match arch {
                Architecture::Aarch64 => "aarch64",
                Architecture::X86 => "x86",
                Architecture::X8664 => "x64",
            };
            let (platform_str, file_type) = match platform {
                Os::Mac => ("macosx", DownloadedFileType::GzipTar),
                Os::Linux => ("linux", DownloadedFileType::GzipTar),
                Os::Windows => ("windows", DownloadedFileType::Zip),
            };

            let ext = match platform {
                Os::Windows => "zip",
                _ => "tar.gz",
            };
            let url = format!(
                "https://corretto.aws/downloads/resources/{version}/amazon-corretto-{version}-{platform_str}-{arch_str}.{ext}"
            );

            let install_path_str = install_path.to_string_lossy().to_string();
            zed::download_file(&url, &install_path_str, file_type)
                .map_err(|e| format!("failed to download Corretto JDK: {e}"))?;

            // Clean up old JDK versions
            if let Ok(entries) = fs::read_dir(&jdk_dir) {
                for entry in entries.flatten() {
                    if entry.file_name().to_str() != Some(version) {
                        let _ = fs::remove_dir_all(entry.path());
                    }
                }
            }
        }

        let java_bin = find_java_binary(&install_path)?;
        let java_path = java_bin.to_string_lossy().to_string();
        self.cached_java_path = Some(java_path.clone());
        Ok(java_path)
    }

    fn install_apex_lsp(&mut self, language_server_id: &LanguageServerId) -> Result<String> {
        if let Some(path) = &self.cached_jar_path {
            if fs::metadata(path).is_ok_and(|m| m.is_file()) {
                return Ok(path.clone());
            }
        }

        let current_dir = env::current_dir()
            .map_err(|e| format!("failed to get current directory: {e}"))?;
        let lsp_dir = current_dir.join(APEX_LSP_INSTALL_DIR);

        zed::set_language_server_installation_status(
            language_server_id,
            &LanguageServerInstallationStatus::CheckingForUpdate,
        );

        let release = zed::latest_github_release(
            "forcedotcom/salesforcedx-vscode",
            zed::GithubReleaseOptions {
                require_assets: true,
                pre_release: false,
            },
        )?;

        let version = &release.version;
        let version_stripped = version.strip_prefix('v').unwrap_or(version);
        let version_dir = lsp_dir.join(version);
        let jar_path = version_dir.join(APEX_LSP_JAR_PATH);

        if !jar_path.exists() {
            zed::set_language_server_installation_status(
                language_server_id,
                &LanguageServerInstallationStatus::Downloading,
            );

            let asset_name = format!("salesforcedx-vscode-apex-{version_stripped}.vsix");
            let asset = release
                .assets
                .iter()
                .find(|a| a.name == asset_name)
                .ok_or_else(|| format!("no asset found matching {asset_name}"))?;

            let version_dir_str = version_dir.to_string_lossy().to_string();
            zed::download_file(
                &asset.download_url,
                &version_dir_str,
                DownloadedFileType::Zip,
            )
            .map_err(|e| format!("failed to download Apex LSP: {e}"))?;

            if !jar_path.exists() {
                return Err(format!(
                    "downloaded VSIX did not contain expected jar at {APEX_LSP_JAR_PATH}"
                ));
            }

            // Clean up old LSP versions
            if let Ok(entries) = fs::read_dir(&lsp_dir) {
                for entry in entries.flatten() {
                    if entry.file_name().to_str() != Some(version) {
                        let _ = fs::remove_dir_all(entry.path());
                    }
                }
            }
        }

        let jar_str = jar_path.to_string_lossy().to_string();
        self.cached_jar_path = Some(jar_str.clone());
        Ok(jar_str)
    }
}

fn find_java_binary(jdk_install_path: &PathBuf) -> Result<PathBuf> {
    let entries = fs::read_dir(jdk_install_path)
        .map_err(|e| format!("failed to read JDK directory: {e}"))?;

    let extracted_dir = entries
        .filter_map(|e| e.ok())
        .find(|e| {
            let name = e.file_name();
            let name_str = name.to_string_lossy();
            name_str.contains("jdk") || name_str.contains("corretto")
        })
        .ok_or_else(|| "no JDK directory found in extracted archive".to_string())?;

    let (platform, _) = zed::current_platform();
    let bin_path = match platform {
        Os::Mac => extracted_dir.path().join("Contents/Home/bin/java"),
        _ => extracted_dir.path().join("bin/java"),
    };

    if !bin_path.exists() {
        return Err(format!("java binary not found at {}", bin_path.display()));
    }

    Ok(bin_path)
}

impl zed::Extension for ApexExtension {
    fn new() -> Self {
        Self {
            cached_jar_path: None,
            cached_java_path: None,
        }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        _worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let java_path = self.install_jdk(language_server_id)?;
        let jar_path = self.install_apex_lsp(language_server_id)?;

        Ok(zed::Command {
            command: java_path,
            args: vec![
                "-cp".to_string(),
                jar_path,
                "-Ddebug.internal.errors=true".to_string(),
                "-Dlwc.typegeneration.disabled=true".to_string(),
                APEX_LSP_MAIN_CLASS.to_string(),
            ],
            env: Default::default(),
        })
    }

    fn language_server_workspace_configuration(
        &mut self,
        server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<zed::serde_json::Value>> {
        LspSettings::for_worktree(server_id.as_ref(), worktree)
            .map(|lsp_settings| lsp_settings.settings)
    }
}

zed::register_extension!(ApexExtension);
