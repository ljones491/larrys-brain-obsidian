// Minimal stand-in for the `obsidian` runtime, aliased in by vitest. The real
// package ships only type declarations, so any symbol used as a *value* in the
// code under test must be provided here. Today that's just `normalizePath`;
// the classes are stubs in case a future test imports one as a value.

/** Collapse separators and trim, matching Obsidian's path normalization. */
export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, '/')
		.replace(/\/{2,}/g, '/')
		.replace(/(^\/+|\/+$)/g, '');
}

export class App {}
export class TFile {}
export class Modal {}
export class Notice {}
export class Setting {}
