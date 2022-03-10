import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export class File {
  static fromConfig(data: FileConfig): File {
    return new File(data.workspaceFolderName, data.path);
  }

  constructor(public workspaceFolderName: string, public path: string) {}

  toConfig(): FileConfig {
    return {
      path: this.path,
      workspaceFolderName: this.workspaceFolderName,
    };
  }

  absPath(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.find(
      (f) => f.name === this.workspaceFolderName
    );
    if (!workspaceFolder) {
      throw new Error(
        `${this.workspaceFolderName} folder is not found in this workspace`
      );
    }
    return path.join(workspaceFolder.uri.fsPath, this.path);
  }
}

type FileConfig = {
  path: string;
  workspaceFolderName: string;
};

type PatternConfig = {
  includeFiles: string[];
  excludeFiles: string[];
  excludeDirs: string[];
};

type ProfileConfig = {
  files?: FileConfig[];
  patterns?: PatternConfig[];
};

type ProfilesConfig = { [name: string]: ProfileConfig };

class Profile {
  static fromConfig(name: string, data: ProfileConfig): Profile {
    return new Profile(
      name,
      data.files?.map((f) => File.fromConfig(f)) || [],
      data.patterns || []
    );
  }

  constructor(
    public name: string,
    private files: File[],
    private patterns: PatternConfig[]
  ) {}

  toConfig(): ProfileConfig {
    return {
      files: this.files.map((f) => f.toConfig()),
      patterns: this.patterns,
    };
  }

  addFile(workspaceFolderName: string, path: string) {
    if (this.files.some((f) => f.path === path)) {
      return;
    }

    this.files = this.files.concat([new File(workspaceFolderName, path)]);
  }

  scanFiles(): File[] {
    return Array.from(
      new Set(
        ([] as File[]).concat(
          this.scanExactFiles(),
          this.scanFilesFromPatterns()
        )
      ).values()
    );
  }

  private scanExactFiles(): File[] {
    return this.files.filter((file) => {
      return fs.existsSync(file.absPath());
    });
  }

  private scanFilesFromPatterns(): File[] {
    if (!vscode.workspace.workspaceFolders) {
      return [];
    }

    return vscode.workspace.workspaceFolders.flatMap((f) =>
      this.patterns.flatMap((p) => this.scanFilesFromPattern(f, p))
    );
  }

  private scanFilesFromPattern(
    workspaceFolder: vscode.WorkspaceFolder,
    pattern: PatternConfig
  ): File[] {
    const includeFiles = pattern.includeFiles?.map((f) => new RegExp(f));
    const excludeDirs = pattern.excludeDirs?.map((f) => new RegExp(f));
    const excludeFiles = pattern.excludeFiles?.map((f) => new RegExp(f));

    const readdir = (dir: string): File[] => {
      let files: File[] = [];
      const paths = fs.readdirSync(dir);
      paths.forEach((filename) => {
        const fullpath = path.join(dir, filename);
        const relativePath = path.relative(
          workspaceFolder.uri.fsPath,
          fullpath
        );
        const stats = fs.statSync(fullpath);

        if (stats.isDirectory()) {
          if (excludeDirs?.some((re) => re.test(relativePath))) {
            return;
          }
          files = files.concat(readdir(fullpath));
        } else {
          if (excludeFiles?.some((re) => re.test(relativePath))) {
            return;
          }
          if (!includeFiles?.some((re) => re.test(relativePath))) {
            return;
          }

          files.push(new File(workspaceFolder.name, relativePath));
        }
      });
      return files;
    };

    return readdir(workspaceFolder.uri.fsPath);
  }
}

const currentProfileKey = "eda.currentProfile";

export class ProfileManager {
  constructor(private workspaceState: vscode.Memento) {}

  private getProfilesConfig(): ProfilesConfig {
    const profiles = vscode.workspace.getConfiguration("eda").get("profiles");
    if (!profiles) {
      return {};
    }
    return profiles as ProfilesConfig;
  }

  private async saveProfilesConfig(profilesConfig: ProfilesConfig) {
    await vscode.workspace
      .getConfiguration("eda")
      .update("profiles", profilesConfig);
  }

  private getProfile(name: string): Profile {
    const profileConfig = this.getProfilesConfig()[name];
    if (!profileConfig) {
      throw new Error(`${name} profile is not found`);
    }
    return Profile.fromConfig(name, profileConfig);
  }

  getCurrentProfileName(): string {
    return (this.workspaceState.get(currentProfileKey) as string) || "default";
  }

  getCurrentProfile(): Profile {
    return this.getProfile(this.getCurrentProfileName());
  }

  async setCurrentProfileName(name: string) {
    await this.workspaceState.update(currentProfileKey, name);
  }

  listProfileNames(): string[] {
    return Object.keys(this.getProfilesConfig());
  }

  async createProfile(name: string): Promise<Profile> {
    const profile = new Profile(name, [], []);
    const profilesConfig = this.getProfilesConfig();
    if (profilesConfig[name]) {
      throw new Error(`${name} profile already exists`);
    }
    await this.saveProfile(profile);
    return profile;
  }

  async saveProfile(profile: Profile) {
    const profilesConfig = this.getProfilesConfig();
    profilesConfig[profile.name] = profile.toConfig();
    await this.saveProfilesConfig(profilesConfig);
  }

  async initialize() {
    const profilesConfig = this.getProfilesConfig();
    if (!profilesConfig["default"]) {
      const profile = new Profile("default", [], []);
      await this.saveProfile(profile);
    }
  }
}
