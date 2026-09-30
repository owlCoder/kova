export interface WorkspacePath {
  readonly workspaceId: string;
  readonly relativePath: string;
  /** Adapter-resolved path; Core does not parse platform-specific paths. */
  readonly canonicalPath: string;
  readonly exists: boolean;
  /** Protected if either requested alias or real target matches a protected rule. */
  readonly protected: boolean;
}
