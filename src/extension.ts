// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
	window,
	commands,
	workspace,
} from 'vscode';
import * as vscode from 'vscode';
import { pickLocalizedDoc } from './localization/localized-docs';

export async function openLocalizedDocument() {
	if (!window.activeTextEditor || !window.activeTextEditor.document) {
		window.showErrorMessage('Please open a localizable document first.');
		return;
	}

	const uri = await pickLocalizedDoc();
	if (uri) {
		const prevLine				= window.activeTextEditor.selection.active.line;
		const prevEditor			= window.visibleTextEditors.find(e => e.document?.uri.fsPath === uri.fsPath);
		
		// If the document is already open, just focus on it
		if (prevEditor) {
			await window.showTextDocument(prevEditor.document, prevEditor.viewColumn);
		}
		// Scroll to the same line as the previously active document
		else {
			const localizedDoc		= await workspace.openTextDocument(uri);
			const editor			= await window.showTextDocument(localizedDoc, prevEditor ? undefined : vscode.ViewColumn.Beside);
			// get the line number of the active document
			editor.revealRange(new vscode.Range(prevLine, 0, prevLine, 0));
			editor.selections = [new vscode.Selection(prevLine, 0, prevLine, 0)];
		}
	}
}

export function activate(context: vscode.ExtensionContext) {
	
	console.log('"vscode-docusaurus" extension is now active!');
	let disposable = commands.registerCommand('vscode-docusaurus.openLocalizedDocument', openLocalizedDocument);
	context.subscriptions.push(disposable);
}

export function deactivate() {}
