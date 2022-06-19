import {
	window,
	workspace,
	QuickPickItem,
	Disposable,
	Uri,
	languages,
} from 'vscode';
import * as fs from 'fs';
import * as vm from 'node:vm';
import * as path from 'path';

class LocalizedDocItem implements QuickPickItem {
	label: string;
	description: string;
	detail: string;
	constructor(label: string, description: string, detail: string) {
		this.label = label;
		this.description = description;
		this.detail = detail;
	}
}

/** Detects a folder that contains `docusaurus.config.js` file.
 * @precondition At least one workspace folder has to be open
 * @returns The folder path or null if not found.
 */
export function detectDocusaurusFolder()
{
	const wksRoot = workspace.workspaceFolders![0].uri.fsPath;
	
	// TODO: make it configurable
	const candidates = [
		'.', 'website'
	];

	const candidate = candidates.find(elem => fs.existsSync(path.join(wksRoot, elem, 'docusaurus.config.js')));
	if (!candidate) {
		return null;
	}

	return path.join(wksRoot, candidate);
}

type DocusaurusSettings = {
	i18n: {
		defaultLocale: string;
		locales: string[];
	}
};

/** Reads docusaurus settings from the `docusaurus.config.js` file.
 * @precondition At least one workspace folder has to be open
 * @returns The settings or null if not found.
 */
export function readDocusaurusSettings() : DocusaurusSettings | null {
	const docusaurusFolder = detectDocusaurusFolder();
	if (!docusaurusFolder) {
		return null;
	}
	
	const configPath = path.join(docusaurusFolder, '.docusaurus', 'docusaurus.config.js');

	if (!fs.existsSync(configPath)) {
		return null;
	}

	// Note: this is a work-around, because export keyword doesn't work for now.
	// TODO: find a better way.
	const code = fs.readFileSync(configPath).toString().replace("export default ", "module.exports = ");
	try {
		return vm.runInNewContext(code, { module: {}, exports: {}, console: console, require: require });
	}
	catch (e) {
		return null;
	}
}

type LocaleSettings = {
	prettyName: string;
};

type Dict<T> = { [key: string]: T };

export const locales = {
	'en': { prettyName: 'English'},
	'pl': { prettyName: 'Polish'},
	'fr': { prettyName: 'French'},
	'de': { prettyName: 'German'},
	'es': { prettyName: 'Spanish'},
	'it': { prettyName: 'Italian'},
	// TODO: make it configurable
} as Dict<LocaleSettings>;

export const contentDocsPluginPrefix = 'docusaurus-plugin-content-docs-';

export async function pickLocalizedDoc() {
	const disposables: Disposable[] = [];
	try {
		return await new Promise<Uri | undefined>((resolve, reject) =>
			{
				if (!workspace.workspaceFolders)
				{
					reject();
					window.showErrorMessage('Please open a workspace folder first.');
					return;
				}
				if (!window.activeTextEditor || !window.activeTextEditor.document)
				{
					reject();
					window.showErrorMessage('Please open a localizable document first.');
					return;
				}

				const docusaurusRoot = detectDocusaurusFolder();
				if (!docusaurusRoot)				
				{
					reject();
					window.showErrorMessage('Could not find "docusaurus.config.js" in your workspace.\nPlease configure the "docusaurus.configSearchPaths" setting.');
					return;
				}

				const settings = readDocusaurusSettings();

				if (!settings)
				{
					reject();
					window.showErrorMessage('Could not read generated "docusaurus.config.js" in your workspace.\nPlease ensure you ran docusaurus at least once (.docusaurus folder exists).');
					return;
				}

				// Example (default locale, assuming docusaurus root is "/path/to/website"):
				//     /path/to/website/content/learn/folder/index.mdx
				// or (different locale)
				//     /path/to/website/i18n/pl/learn/current/folder/index.mdx
				const docPath			= window.activeTextEditor.document.uri.fsPath;

				const defaultLocaleFolder = 'content'; // TODO: make it configurable

				// Example (default locale)
				//     content/learn/folder/index.mdx
				// or (different locale)
				//     i18n/pl/learn/current/folder/index.mdx
				const docRelPath		= path.relative(docusaurusRoot, docPath);

				 // TODO: make it configurable
				const isDefaultLocale	= !docRelPath.startsWith('i18n');

				// Example (default locale)
				//     ['content', 'learn', 'folder', 'index.mdx']
				// or (different locale)
				//     ['i18n', 'pl', 'learn', 'current', 'folder', 'index.mdx']
				const splittedPath		= docRelPath.split(/[\\\/]/);

				// Example: 'en'
				const localeId			= isDefaultLocale ? settings.i18n.defaultLocale : splittedPath[1];

				// Example: 'learn' (plugin content docs prefix is removed and will be optionally applied later)
				let pluginId			= isDefaultLocale ? splittedPath[1] : splittedPath[2];
				if (pluginId.startsWith(contentDocsPluginPrefix))
				{
					pluginId = pluginId.substring(contentDocsPluginPrefix.length);
				}

				// Example: 'folder/index.mdx'
				const pluginRelativePath = path.join(...splittedPath.slice(isDefaultLocale ? 2 : 4));
				
				// TODO: support other types of plugins
				const fullPluginName	= contentDocsPluginPrefix + pluginId;

				const makeLocalizedPath = (lang: string) => {
					const make = (full : boolean) => path.join(docusaurusRoot, "i18n", lang, (full ? fullPluginName : pluginId), "current", pluginRelativePath);

					// Try to go without the "docusaurus-plugin-content-docs-" prefix
					// in case we're using symlinks.
					const without = make(false);
					if (fs.existsSync(without)) {
						return without;
					}

					return make(true);
				};

				const input				= window.createQuickPick<LocalizedDocItem>();

				input.placeholder = 'Select a localized document';
				let items = [
					new LocalizedDocItem(
						locales[settings.i18n.defaultLocale].prettyName,
						settings.i18n.defaultLocale + (isDefaultLocale ? ' (current)' : ''),
						path.join(docusaurusRoot, defaultLocaleFolder, pluginId, pluginRelativePath)
					),
				];
				settings.i18n.locales.forEach(lang => {
					if (lang === settings.i18n.defaultLocale) {
						return;
					}
					const localizedPath = makeLocalizedPath(lang);
					if (!fs.existsSync(localizedPath)) {
						return;
					}
					items.push(new LocalizedDocItem(
						locales[lang].prettyName,
						lang + (lang === localeId ? ' (current)' : ''),
						localizedPath,
					));
				});
				input.items = items;

				input.onDidChangeSelection((items) => {
					const selection = items[0];
					if (selection) {
						resolve(Uri.file(selection.detail));
						input.hide();
					}
				});

				input.show();
			}
		);
	}
	finally {
		disposables.forEach(d => d.dispose());
	}
}