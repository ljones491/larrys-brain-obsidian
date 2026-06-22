import type { App, TFile } from 'obsidian';
import { appendEdge, normalizeEdgeType } from '../edge';
import { createDumpNote, DumpNoteMeta } from '../capture/note';
import { createObject, NewObject } from '../object/object';

/**
 * The Relate command's orchestration: write a typed edge from the note on
 * screen (the *subject*) to another note (the *object*). Edges read as actions
 * from subject to object, so the edge always lands in the subject's body.
 *
 * The object can be an existing note or one created on the spot — a new thought
 * or a new OBJECT instance — reusing the same create flows the standalone
 * commands use. Those flows create *and* open the target; the edge is then
 * written into the subject's file on disk, which stays valid whatever leaf is
 * on screen. The edge primitive itself ({@link appendEdge}) lives in `edge.ts`;
 * this module just resolves the object and names the edge.
 */

/** Link `subject` to an already-chosen existing note. */
export async function relateToExisting(
	app: App,
	subject: TFile,
	edgeType: string,
	target: TFile,
): Promise<void> {
	await appendEdge(app, subject, normalizeEdgeType(edgeType), target.basename);
}

/**
 * Create a new thought as the object, then link `subject` to it. Returns the
 * new note so the caller can surface it.
 */
export async function relateToNewThought(
	app: App,
	subject: TFile,
	edgeType: string,
	text: string,
	meta: DumpNoteMeta,
): Promise<TFile> {
	const target = await createDumpNote(app, text, meta);
	await appendEdge(app, subject, normalizeEdgeType(edgeType), target.basename);
	return target;
}

/**
 * Create a new OBJECT instance as the object, then link `subject` to it. Returns
 * the new note so the caller can surface it.
 */
export async function relateToNewObject(
	app: App,
	subject: TFile,
	edgeType: string,
	object: NewObject,
): Promise<TFile> {
	const target = await createObject(app, object);
	await appendEdge(app, subject, normalizeEdgeType(edgeType), target.basename);
	return target;
}
