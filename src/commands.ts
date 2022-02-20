import * as path from "path";
import * as vscode from "vscode";
import { ProfileManager } from "./profile";

export const refreshTreeCommandName = "eda.refreshTree";

export const executeRefreshTree = () => {
  vscode.commands.executeCommand(refreshTreeCommandName);
};

export const addFile = (profileManager: ProfileManager) => {
  return async (_: any, explorerFiles: any[]) => {
    let paths: string[];
    if (explorerFiles) {
      paths = explorerFiles.map((file) => file.path);
    } else {
      const activeTextEditor = vscode.window.activeTextEditor;
      if (!activeTextEditor) {
        vscode.window.showErrorMessage("No window is opened");
        return;
      }
      paths = [activeTextEditor.document.uri.fsPath];
    }

    const profile = profileManager.getCurrentProfile();
    paths.forEach((filepath) => {
      const folder = vscode.workspace.getWorkspaceFolder(
        vscode.Uri.file(filepath)
      );
      if (!folder) {
        vscode.window.showWarningMessage("cannot add this file");
        return;
      }

      const relativePath = path.relative(folder.uri.fsPath, filepath);

      profile.addFile(folder.name, relativePath);
    });

    await profileManager.saveProfile(profile);

    executeRefreshTree();
  };
};

interface FileQuickPickItem extends vscode.QuickPickItem {
  absPath: string;
}

export const openFile = (profileManager: ProfileManager) => {
  return async () => {
    const currentProfile = profileManager.getCurrentProfile();
    const files = currentProfile.scanFiles();

    const quickPick = vscode.window.createQuickPick<FileQuickPickItem>();
    quickPick.items = files.map(
      (f): FileQuickPickItem => ({
        label: f.path,
        description: f.workspaceFolderName,
        absPath: f.absPath(),
      })
    );
    quickPick.show();
    quickPick.onDidAccept((e) => {
      const absPath = quickPick.selectedItems[0].absPath;
      if (!absPath) {
        return;
      }
      vscode.commands.executeCommand("vscode.open", vscode.Uri.file(absPath));
    });
  };
};

export const createProfile = (profileManager: ProfileManager) => {
  return async () => {
    const name = await vscode.window.showInputBox({
      placeHolder: "New Profile Name",
    });
    if (!name) {
      return;
    }

    await profileManager.createProfile(name);
    await profileManager.setCurrentProfileName(name);
    executeRefreshTree();
  };
};

export const switchProfile = (profileManager: ProfileManager) => {
  return async () => {
    const currentName = profileManager.getCurrentProfileName();
    const names = profileManager
      .listProfileNames()
      .map((name) => (name === currentName ? `${name} (Current)` : name));
    const name = await vscode.window.showQuickPick(names);
    if (!name) {
      return;
    }

    await profileManager.setCurrentProfileName(name.replace(" (Current)", ""));
    executeRefreshTree();
  };
};
