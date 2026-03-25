import { useState, useRef, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui";
import {
  Plus, Trash2, FileText, Upload, Image, Eye, Edit3, ChevronRight,
  Download, Copy, MoreHorizontal, Check, X,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DocTemplate {
  id: string;
  name: string;
  content: string;
  backgroundImage?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Data fields available for insertion ───────────────────────────────────────
const FIELD_GROUPS = [
  {
    label: "Project",
    fields: [
      { token: "{{project_name}}",     label: "Project Name" },
      { token: "{{project_address}}",  label: "Site Address" },
      { token: "{{council_number}}",   label: "Council / Permit No." },
      { token: "{{ncc_class}}",        label: "NCC Building Class" },
      { token: "{{lot_number}}",       label: "Lot Number" },
      { token: "{{da_number}}",        label: "DA / BA Number" },
    ],
  },
  {
    label: "Inspection",
    fields: [
      { token: "{{inspection_type}}",  label: "Inspection Type" },
      { token: "{{inspection_date}}",  label: "Inspection Date" },
      { token: "{{inspection_time}}",  label: "Inspection Time" },
      { token: "{{result}}",           label: "Result (Pass/Fail)" },
      { token: "{{notes}}",            label: "Inspector Notes" },
    ],
  },
  {
    label: "Inspector / Certifier",
    fields: [
      { token: "{{inspector_name}}",   label: "Inspector Name" },
      { token: "{{certifier_name}}",   label: "Certifier Name" },
      { token: "{{license_number}}",   label: "License Number" },
      { token: "{{company_name}}",     label: "Company Name" },
      { token: "{{company_address}}",  label: "Company Address" },
      { token: "{{phone}}",            label: "Phone" },
      { token: "{{email}}",            label: "Email" },
    ],
  },
  {
    label: "Date & Time",
    fields: [
      { token: "{{today}}",            label: "Today's Date" },
      { token: "{{time_now}}",         label: "Current Time" },
      { token: "{{year}}",             label: "Year" },
    ],
  },
  {
    label: "Signature",
    fields: [
      { token: "{{signature_line}}",   label: "Signature Line" },
      { token: "{{signature_block}}",  label: "Signature Block" },
    ],
  },
];

// ── LocalStorage helpers ───────────────────────────────────────────────────────
const STORAGE_KEY = "inspectproof_doc_templates";

function loadTemplates(): DocTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: DocTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function newTemplate(): DocTemplate {
  const now = new Date().toISOString();
  return {
    id: `tmpl_${Date.now()}`,
    name: "Untitled Template",
    content: `<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0B1933;">INSPECTION REPORT</h2>
<p style="margin:0 0 8px;"><strong>Project:</strong> {{project_name}}</p>
<p style="margin:0 0 8px;"><strong>Site Address:</strong> {{project_address}}</p>
<p style="margin:0 0 8px;"><strong>Inspection Type:</strong> {{inspection_type}}</p>
<p style="margin:0 0 8px;"><strong>Date:</strong> {{inspection_date}}</p>
<p style="margin:0 0 8px;"><strong>Inspector:</strong> {{inspector_name}}</p>
<p style="margin:0 0 24px;"><strong>Result:</strong> {{result}}</p>
<p style="margin:0 0 8px;"><strong>Notes:</strong></p>
<p style="margin:0 0 32px;">{{notes}}</p>
<p style="margin:0 0 4px;border-top:1px solid #ccc;padding-top:12px;font-size:13px;color:#666;">{{certifier_name}} — License No. {{license_number}}</p>
<p style="margin:0;font-size:13px;color:#666;">{{company_name}}</p>`,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Token highlight helper ────────────────────────────────────────────────────
function highlightTokens(html: string): string {
  return html.replace(
    /(\{\{[a-z_]+\}\})/g,
    `<span style="background:#dbeafe;color:#1d4ed8;border-radius:3px;padding:0 3px;font-family:monospace;font-size:12px;">$1</span>`
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DocTemplates() {
  const [templates, setTemplates] = useState<DocTemplate[]>(loadTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const saved = loadTemplates();
    return saved.length > 0 ? saved[0].id : null;
  });
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saved, setSaved] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const selected = templates.find(t => t.id === selectedId) ?? null;

  function persist(updated: DocTemplate[]) {
    setTemplates(updated);
    saveTemplates(updated);
  }

  function createTemplate() {
    const t = newTemplate();
    const updated = [...templates, t];
    persist(updated);
    setSelectedId(t.id);
    setMode("edit");
  }

  function deleteTemplate(id: string) {
    const updated = templates.filter(t => t.id !== id);
    persist(updated);
    if (selectedId === id) {
      setSelectedId(updated.length > 0 ? updated[0].id : null);
    }
  }

  function duplicateTemplate(id: string) {
    const src = templates.find(t => t.id === id);
    if (!src) return;
    const now = new Date().toISOString();
    const copy: DocTemplate = {
      ...src,
      id: `tmpl_${Date.now()}`,
      name: `${src.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [...templates, copy];
    persist(updated);
    setSelectedId(copy.id);
  }

  function startRename(t: DocTemplate) {
    setRenamingId(t.id);
    setRenameValue(t.name);
  }

  function commitRename() {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    const updated = templates.map(t =>
      t.id === renamingId ? { ...t, name: renameValue.trim(), updatedAt: new Date().toISOString() } : t
    );
    persist(updated);
    setRenamingId(null);
  }

  // Sync editor content when selected template changes
  useEffect(() => {
    if (editorRef.current && selected) {
      editorRef.current.innerHTML = selected.content;
    }
  }, [selectedId]);

  function saveContent() {
    if (!editorRef.current || !selected) return;
    const updated = templates.map(t =>
      t.id === selected.id
        ? { ...t, content: editorRef.current!.innerHTML, updatedAt: new Date().toISOString() }
        : t
    );
    persist(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function insertToken(token: string) {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(token));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editorRef.current.innerHTML += token;
    }
  }

  function handleBgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      const updated = templates.map(t =>
        t.id === selected.id ? { ...t, backgroundImage: dataUrl, updatedAt: new Date().toISOString() } : t
      );
      persist(updated);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function clearBg() {
    if (!selected) return;
    const updated = templates.map(t =>
      t.id === selected.id ? { ...t, backgroundImage: undefined, updatedAt: new Date().toISOString() } : t
    );
    persist(updated);
  }

  function execCmd(cmd: string, value?: string) {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <AppLayout>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Templates</h1>
          <p className="text-muted-foreground mt-1">
            Create reusable document templates with your letterhead and data fields.
          </p>
        </div>
        <Button onClick={createTemplate} className="gap-2 bg-secondary hover:bg-secondary/90 text-white shadow-sm font-semibold">
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      <div className="flex gap-4 h-[calc(100vh-200px)] min-h-[560px]">

        {/* ── Left: Template list ───────────────────────────────────────────── */}
        <div className="w-56 shrink-0 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-3 py-2.5 border-b border-border bg-muted/30">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Templates</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {templates.length === 0 ? (
              <div className="py-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No templates yet</p>
              </div>
            ) : templates.map(t => (
              <div key={t.id} className="group relative">
                {renamingId === t.id ? (
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                      className="flex-1 text-xs px-1.5 py-0.5 rounded border border-secondary focus:outline-none focus:ring-1 focus:ring-secondary/50 bg-background"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setSelectedId(t.id); setMode("edit"); }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors flex items-start gap-2 ${
                      selectedId === t.id
                        ? "bg-secondary text-white"
                        : "hover:bg-muted text-sidebar"
                    }`}
                  >
                    <FileText className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${selectedId === t.id ? "text-white" : "text-muted-foreground"}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs font-medium truncate ${selectedId === t.id ? "text-white" : ""}`}>{t.name}</div>
                      <div className={`text-[10px] mt-0.5 ${selectedId === t.id ? "text-blue-100" : "text-muted-foreground"}`}>
                        {formatDate(t.updatedAt)}
                      </div>
                    </div>
                  </button>
                )}

                {/* Context actions */}
                {selectedId === t.id && renamingId !== t.id && (
                  <div className="absolute right-1 top-1.5 hidden group-hover:flex items-center gap-0.5 bg-white/90 rounded-md shadow-sm border border-border p-0.5">
                    <button title="Rename" onClick={() => startRename(t)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-sidebar">
                      <Edit3 className="h-3 w-3" />
                    </button>
                    <button title="Duplicate" onClick={() => duplicateTemplate(t.id)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-sidebar">
                      <Copy className="h-3 w-3" />
                    </button>
                    <button title="Delete" onClick={() => deleteTemplate(t.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Center: Document editor / preview ────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                {/* Mode toggles */}
                <div className="flex rounded-lg border border-border overflow-hidden bg-card shadow-sm mr-2">
                  <button
                    onClick={() => setMode("edit")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${mode === "edit" ? "bg-secondary text-white" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => { saveContent(); setMode("preview"); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${mode === "preview" ? "bg-secondary text-white" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>
                </div>

                {mode === "edit" && (
                  <>
                    {/* Text formatting */}
                    <div className="flex rounded-lg border border-border overflow-hidden bg-card shadow-sm">
                      <button onClick={() => execCmd("bold")} title="Bold" className="px-2.5 py-1.5 text-xs font-bold hover:bg-muted border-r border-border transition-colors">B</button>
                      <button onClick={() => execCmd("italic")} title="Italic" className="px-2.5 py-1.5 text-xs italic hover:bg-muted border-r border-border transition-colors">I</button>
                      <button onClick={() => execCmd("underline")} title="Underline" className="px-2.5 py-1.5 text-xs underline hover:bg-muted transition-colors">U</button>
                    </div>
                    <div className="flex rounded-lg border border-border overflow-hidden bg-card shadow-sm">
                      <button onClick={() => execCmd("justifyLeft")} title="Align left" className="px-2.5 py-1.5 text-xs hover:bg-muted border-r border-border transition-colors">≡</button>
                      <button onClick={() => execCmd("justifyCenter")} title="Center" className="px-2.5 py-1.5 text-xs hover:bg-muted border-r border-border transition-colors">≡̈</button>
                      <button onClick={() => execCmd("justifyRight")} title="Align right" className="px-2.5 py-1.5 text-xs hover:bg-muted transition-colors">≡</button>
                    </div>
                    <select
                      onChange={e => { if (e.target.value) { execCmd("formatBlock", e.target.value); e.target.value = ""; } }}
                      className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm focus:outline-none focus:ring-1 focus:ring-secondary/50"
                      defaultValue=""
                    >
                      <option value="" disabled>Style…</option>
                      <option value="h1">Heading 1</option>
                      <option value="h2">Heading 2</option>
                      <option value="h3">Heading 3</option>
                      <option value="p">Paragraph</option>
                    </select>

                    {/* Background */}
                    <button
                      onClick={() => bgInputRef.current?.click()}
                      title="Upload background / letterhead image"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted shadow-sm transition-colors text-muted-foreground"
                    >
                      <Image className="h-3.5 w-3.5" />
                      Background
                    </button>
                    {selected.backgroundImage && (
                      <button onClick={clearBg} title="Remove background" className="p-1.5 rounded-lg border border-border bg-card hover:bg-red-50 hover:text-red-600 text-muted-foreground shadow-sm transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />

                    {/* Save */}
                    <button
                      onClick={saveContent}
                      className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all ${
                        saved
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-secondary text-white hover:bg-secondary/90"
                      }`}
                    >
                      {saved ? <><Check className="h-3.5 w-3.5" />Saved</> : "Save"}
                    </button>
                  </>
                )}
              </div>

              {/* A4 Document area */}
              <div className="flex-1 overflow-auto bg-muted/30 rounded-xl border border-border p-6 flex justify-center">
                <div
                  className="relative bg-white shadow-xl"
                  style={{
                    width: "794px",
                    minHeight: "1123px",
                    fontFamily: "Georgia, serif",
                    fontSize: "14px",
                    lineHeight: "1.6",
                    color: "#1a1a1a",
                  }}
                >
                  {/* Background image (letterhead) */}
                  {selected.backgroundImage && (
                    <img
                      src={selected.backgroundImage}
                      alt="Background"
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                      style={{ opacity: 0.15 }}
                    />
                  )}

                  {/* Editor / Preview area */}
                  <div
                    ref={editorRef}
                    contentEditable={mode === "edit"}
                    suppressContentEditableWarning
                    onBlur={saveContent}
                    style={{ padding: "72px 80px", position: "relative", minHeight: "1123px", outline: "none" }}
                    className={mode === "edit" ? "focus:ring-0" : ""}
                    dangerouslySetInnerHTML={mode === "preview" ? { __html: highlightTokens(selected.content) } : undefined}
                  />
                  {mode === "edit" && (
                    <div className="absolute top-2 right-2 text-[10px] text-muted-foreground bg-white/80 rounded px-1.5 py-0.5 pointer-events-none">
                      Click to edit
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-card rounded-xl border border-border">
              <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium mb-1">No template selected</p>
              <p className="text-sm text-muted-foreground/70 mb-4">Create your first template to get started</p>
              <Button onClick={createTemplate} className="gap-2 bg-secondary hover:bg-secondary/90 text-white">
                <Plus className="h-4 w-4" />
                New Template
              </Button>
            </div>
          )}
        </div>

        {/* ── Right: Field palette ──────────────────────────────────────────── */}
        {selected && mode === "edit" && (
          <div className="w-52 shrink-0 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-3 py-2.5 border-b border-border bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Data Fields</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Click to insert at cursor</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {FIELD_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 mb-1">{group.label}</p>
                  <div className="space-y-0.5">
                    {group.fields.map(f => (
                      <button
                        key={f.token}
                        onClick={() => insertToken(f.token)}
                        title={f.token}
                        className="w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-secondary/10 hover:text-secondary transition-colors flex items-center gap-2 group"
                      >
                        <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/50 group-hover:text-secondary shrink-0" />
                        <span className="truncate">{f.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
