import { App, Plugin, PluginSettingTab, Setting, Notice, TFile } from "obsidian";

interface MoodnoteSettings {
	folderPath: string; // 상대 경로 권장, 예: "moodnote/"
}

const DEFAULT_SETTINGS: MoodnoteSettings = {
	folderPath: "moodnote/",
};

export default class MoodnotePlugin extends Plugin {
	settings: MoodnoteSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// 리본 메뉴: 오늘자 월별 노트 열기
		this.addRibbonIcon("calendar", "오늘 moodnote 열기", async () => {
			try {
				await this.openOrCreateMonthlyNoteAndJumpToToday();
			} catch (e) {
				console.error(e);
				new Notice("moodnote 실행 중 오류가 발생했습니다");
			}
		});

		this.addCommand({
			id: "moodnote-open-or-create-current-month",
			name: "오늘 moodnote 열기",
			icon: "calendar",
			callback: async () => {
				try {
					await this.openOrCreateMonthlyNoteAndJumpToToday();
				} catch (e) {
					console.error(e);
					new Notice("moodnote 실행 중 오류가 발생했습니다");
				}
			},
		});

		this.addSettingTab(new MoodnoteSettingTab(this.app, this));
	}

	async onunload() {}

	private getCurrentMonthFileName(): string {
		const now = new Date();
		const y = now.getFullYear();
		const m = String(now.getMonth() + 1).padStart(2, "0");
		return `${y}-${m}`;
	}

	private getTodayHeader(): string {
		const now = new Date();
		const day = String(now.getDate()).padStart(2, "0");
		const weekday = now.toLocaleDateString("ko-KR", { weekday: "short" });
		// 형식: ### DD일 (ddd)  예: ### 13일 (토)
		return `### ${day}일 (${weekday})`;
	}

	private getTodayHeaderRegex(): RegExp {
		const now = new Date();
		const day = String(now.getDate()).padStart(2, "0");
		// 형식: ### DD일 (ddd)
		return new RegExp(`^###\\s+${day}일\\s+\\([^)]+\\)`, "m");
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const normalized = folderPath.replace(/\\\\/g, "/");
		if (!normalized || normalized === "/") return; // 루트는 생성 불가 의미로 패스
		const vault = this.app.vault;
		const adapter = vault.adapter;
		const parts = normalized.split("/").filter(Boolean);
		let accum = "";
		for (const part of parts) {
			accum = accum ? `${accum}/${part}` : part;
			if (!(await adapter.exists(accum))) {
				await adapter.mkdir(accum);
			}
		}
	}

	private async openOrCreateMonthlyNoteAndJumpToToday(): Promise<void> {
		const folder = this.settings.folderPath?.trim() || DEFAULT_SETTINGS.folderPath;
		const fileName = this.getCurrentMonthFileName();
		const path = folder.endsWith("/") ? `${folder}${fileName}.md` : `${folder}/${fileName}.md`;

		await this.ensureFolder(folder);

		let file: TFile | null = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		if (!file) {
			file = await this.app.vault.create(path, "");
		}

		// 항상 가장 최근 활성 패널을 재사용하여 열기 (새 탭 생성하지 않음)
		const leaf = this.app.workspace.getLeaf(false);
		if (leaf) {
			await (leaf as any).openFile(file);
			this.app.workspace.setActiveLeaf(leaf);
		}
		const view: any = leaf?.view;
		const editor = view?.editor;
		if (!editor) return;

		const content = editor.getValue();
		const todayHeader = this.getTodayHeader();
		const headerRegex = this.getTodayHeaderRegex();

		let updated = content;
		if (!headerRegex.test(content)) {
			// 오늘 헤더가 없으면 문서 끝에 추가
			if (updated.length > 0 && !updated.endsWith("\n")) {
				updated += "\n";
			}
			updated += `${todayHeader}\n`;
			editor.setValue(updated);
			// 저장
			await this.app.vault.modify(file!, updated);
		}

		// 오늘 헤더 위치로 커서 이동 및 스크롤
		const fullText = editor.getValue();
		const pos = fullText.indexOf(todayHeader);
		editor.focus();
		if (pos >= 0) {
			const before = fullText.slice(0, pos);
			const headerLine = before.split("\n").length - 1;
			// 헤더 아래 섹션의 끝을 계산: 다음 '### ' 헤더 이전까지 또는 문서 끝
			const lines = fullText.split("\n");
			let i = headerLine + 1; // 헤더 바로 아래 라인부터 검사
			let nextHeaderLine = -1;
			for (; i < lines.length; i++) {
				if (lines[i].startsWith("### ")) {
					nextHeaderLine = i;
					break;
				}
			}
			const sectionEndLine = nextHeaderLine === -1 ? lines.length - 1 : nextHeaderLine - 1;
			// 섹션 내 마지막 비어있지 않은 라인을 찾고, 없다면 헤더 아래 줄로 이동
			let targetLine = Math.min(headerLine + 1, editor.lineCount() - 1);
			for (let j = sectionEndLine; j >= headerLine + 1; j--) {
				if (lines[j].trim().length > 0) {
					targetLine = j;
					break;
				}
			}
			const targetCh = lines[targetLine]?.length ?? 0; // 해당 라인의 끝으로 이동
			editor.setCursor({ line: targetLine, ch: targetCh });
			// 스크롤을 물리적 끝까지 밀기
			if ((editor as any).cm?.scrollDOM) {
				const scrollEl = (editor as any).cm.scrollDOM;
				scrollEl.scrollTop = scrollEl.scrollHeight - scrollEl.clientHeight;
			}
		} else {
			// 폴백: 맨 끝으로 이동
			const lastLine = editor.lineCount() - 1;
			editor.setCursor({ line: lastLine, ch: 0 });
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class MoodnoteSettingTab extends PluginSettingTab {
	plugin: MoodnotePlugin;

	constructor(app: App, plugin: MoodnotePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "moodnote 설정" });

		new Setting(containerEl)
			.setName("폴더 경로")
			.setDesc("월별 노트를 저장할 폴더 (예: moodnote/)")
			.addText((text) => {
				text
					.setPlaceholder("moodnote/")
					.setValue(this.plugin.settings.folderPath)
					.onChange(async (value) => {
						this.plugin.settings.folderPath = value;
						await this.plugin.saveSettings();
					});
			});
	}
}

