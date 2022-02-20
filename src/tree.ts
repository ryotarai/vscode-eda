import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { File, ProfileManager } from "./profile";

class BaseItem extends vscode.TreeItem {
  children: BaseItem[];

  constructor(
    label: string | vscode.TreeItemLabel,
    collapsibleState?: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.children = [];
  }

  addFile(
    workspaceFolder: vscode.WorkspaceFolder,
    relativePath: string
  ): FileItem {
    const child = this.children.find((child) => {
      if (child instanceof FileItem) {
        const fileItem = child as FileItem;
        return (
          fileItem.relativePath === relativePath &&
          fileItem.workspaceFolder === workspaceFolder
        );
      }
      return false;
    });
    if (child) {
      return child as FileItem;
    }

    const item = new FileItem(workspaceFolder, relativePath);
    this.children = this.children.concat([item]);
    return item;
  }

  protected defaultCollapsibleState() {
    const collapseTree: boolean =
      vscode.workspace.getConfiguration("eda").get("collapseTreeAtOpen") ||
      false;
    return collapseTree
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.Expanded;
  }
}

class WorkspaceFolderItem extends BaseItem {
  constructor(public workspaceFolder: vscode.WorkspaceFolder) {
    super(workspaceFolder.name);
    this.contextValue = "workspaceFolder";
    this.collapsibleState = this.defaultCollapsibleState();
  }
}

export class FileItem extends BaseItem {
  private _isDir: boolean;

  constructor(
    public workspaceFolder: vscode.WorkspaceFolder,
    public relativePath: string
  ) {
    super("");

    const parts = relativePath.split(path.sep);
    this.label = parts[parts.length - 1];

    const absPath = path.join(workspaceFolder.uri.fsPath, relativePath);
    this.resourceUri = vscode.Uri.file(absPath);

    const stats = fs.statSync(absPath);
    if (stats.isDirectory()) {
      this._isDir = true;
      this.collapsibleState = this.defaultCollapsibleState();
      this.contextValue = "directory";
    } else {
      this._isDir = false;
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.contextValue = "file";
      this.command = {
        title: "",
        command: "vscode.open",
        arguments: [this.resourceUri],
      };
    }
  }

  isDir() {
    return this._isDir;
  }
}

const filesToTree = (files: File[]): BaseItem[] => {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return [];
  }

  const workspaceFolderItems = Object.fromEntries(
    workspaceFolders.map((f) => [f.name, new WorkspaceFolderItem(f)])
  );
  files.forEach((file) => {
    const workspaceFolderItem = workspaceFolderItems[file.workspaceFolderName];
    if (!workspaceFolderItem) {
      return;
    }

    let current: BaseItem = workspaceFolderItem;
    file.path.split(path.sep).forEach((_, index, array) => {
      current = current.addFile(
        workspaceFolderItem.workspaceFolder,
        path.join(...array.slice(0, index + 1))
      );
    });
  });

  if (workspaceFolders.length === 1) {
    return Object.values(workspaceFolderItems)[0].children;
  } else {
    return Object.values(workspaceFolderItems);
  }
};

const sortTree = (items: BaseItem[]): BaseItem[] => {
  items.forEach((item) => {
    item.children = sortTree(item.children);
  });

  return items.sort((a, b) => {
    if (a instanceof WorkspaceFolderItem && b instanceof WorkspaceFolderItem) {
      return 0;
    } else if (a instanceof FileItem && b instanceof FileItem) {
      if (a.isDir() && !b.isDir()) {
        return -1;
      } else if (!a.isDir() && b.isDir()) {
        return 1;
      } else {
        return a.label! > b.label! ? 1 : -1;
      }
    } else {
      throw new Error("Unexpected comparison");
    }
  });
};

export class FileTreeProvider implements vscode.TreeDataProvider<BaseItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    BaseItem | undefined | null | void
  > = new vscode.EventEmitter<BaseItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    BaseItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private profileManager: ProfileManager) {}

  getTreeItem(element: BaseItem): BaseItem {
    return element;
  }

  getChildren(element?: BaseItem): Thenable<BaseItem[]> {
    if (element) {
      return Promise.resolve(element.children);
    } else {
      const profile = this.profileManager.getCurrentProfile();
      const files = profile.scanFiles();
      const items = sortTree(filesToTree(files));
      return Promise.resolve(items);
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
