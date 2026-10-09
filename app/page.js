"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const EMPTY_PROJECT = { id: "general", name: "Без проекта" };

const starter = {
  chats: [{ id: "welcome", title: "Новый чат", projectId: "general", mode: "chat", messages: [] }],
  projects: [EMPTY_PROJECT],
  assistants: []
};

function loadState() {
  if (typeof window === "undefined") return starter;
  try {
    const raw = localStorage.getItem("si-base-state");
    return raw ? { ...starter, ...JSON.parse(raw) } : starter;
  } catch {
    return starter;
  }
}

export default function Home() {
  const [data, setData] = useState(starter);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState("chat");
  const [chatId, setChatId] = useState("welcome");
  const [projectId, setProjectId] = useState("general");
  const [assistantId, setAssistantId] = useState("");
  const [model, setModel] = useState("aven");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const s = loadState();
    setData(s);
    setChatId(s.chats?.[0]?.id || "welcome");
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("si-base-state", JSON.stringify(data));
  }, [data, ready]);

  const chats = useMemo(
    () => data.chats.filter(c => c.mode === mode && c.projectId === projectId),
    [data.chats, mode, projectId]
  );

  const current = data.chats.find(c => c.id === chatId) || chats[0];
  const assistant = data.assistants.find(a => a.id === assistantId);

  function newChat() {
    const c = {
      id: uid(),
      title: "Новый чат",
      projectId,
      mode,
      assistantId: mode === "work" ? assistantId : "",
      messages: []
    };
    setData(d => ({ ...d, chats: [c, ...d.chats] }));
    setChatId(c.id);
    setMobileMenu(false);
  }

  function addProject() {
    const name = prompt("Название проекта");
    if (!name?.trim()) return;
    const p = { id: uid(), name: name.trim() };
    const c = { id: uid(), title: "Новый чат", projectId: p.id, mode, messages: [] };
    setData(d => ({ ...d, projects: [...d.projects, p], chats: [c, ...d.chats] }));
    setProjectId(p.id);
    setChatId(c.id);
  }

  function addAssistant() {
    const name = prompt("Имя ассистента");
    if (!name?.trim()) return;
    const system = prompt("Что должен делать ассистент?") || "Будь полезным рабочим помощником.";
    const a = { id: uid(), name: name.trim(), system };
    setData(d => ({ ...d, assistants: [...d.assistants, a] }));
    setAssistantId(a.id);
  }

  async function upload(files) {
    const next = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        const r = await fetch("/api/files", { method: "POST", body: fd });
        const j = await r.json();
        next.push({ id: uid(), ...j });
      } catch {
        next.push({ id: uid(), name: file.name, text: "[Ошибка загрузки файла]" });
      }
    }
    setAttachments(a => [...a, ...next]);
  }

  async function send() {
    if (busy || (!input.trim() && attachments.length === 0)) return;

    let target = current;
    if (!target) {
      const c = { id: uid(), title: "Новый чат", projectId, mode, messages: [] };
      setData(d => ({ ...d, chats: [c, ...d.chats] }));
      setChatId(c.id);
      target = c;
    }

    const parts = [];
    if (input.trim()) parts.push({ type: "text", text: input.trim() });

    for (const a of attachments) {
      if (a.imageDataUrl) {
        parts.push({ type: "image_url", image_url: { url: a.imageDataUrl } });
      } else {
        parts.push({ type: "text", text: `\n\nФайл: ${a.name}\n${a.text || ""}` });
      }
    }

    const content = parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
    const userMessage = { role: "user", content };
    const visibleText = input.trim() || attachments.map(a => a.name).join(", ");
    const newTitle = target.messages.length === 0 ? visibleText.slice(0, 34) || "Файлы" : target.title;
    const previous = target.messages || [];

    setData(d => ({
      ...d,
      chats: d.chats.map(c => c.id === target.id
        ? { ...c, title: newTitle, messages: [...previous, userMessage] }
        : c)
    }));

    setInput("");
    setAttachments([]);
    setBusy(true);

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          system: mode === "work" && assistant ? assistant.system : "",
          messages: [...previous, userMessage]
        })
      });
      const j = await r.json();
      const answer = { role: "assistant", content: j.content || `Ошибка: ${j.error || "нет ответа"}` };
      setData(d => ({
        ...d,
        chats: d.chats.map(c => c.id === target.id
          ? { ...c, messages: [...previous, userMessage, answer] }
          : c)
      }));
    } catch {
      setData(d => ({
        ...d,
        chats: d.chats.map(c => c.id === target.id
          ? { ...c, messages: [...previous, userMessage, { role: "assistant", content: "Ошибка соединения с сервером." }] }
          : c)
      }));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    const c = data.chats.find(x => x.mode === next && x.projectId === projectId);
    setChatId(c?.id || "");
    setMobileMenu(false);
  }

  const messages = current?.messages || [];

  return (
    <main className="shell">
      <aside className={"sidebar " + (mobileMenu ? "open" : "")}>
        <div className="brand">
          <span className="mark">SI</span>
          <div><b>SI BASE</b><small>AI workspace</small></div>
        </div>

        <button className="new" onClick={newChat}>＋ Новый чат</button>

        <nav className="modes">
          <button className={mode === "chat" ? "active" : ""} onClick={() => switchMode("chat")}>◉ Чат</button>
          <button className={mode === "work" ? "active" : ""} onClick={() => switchMode("work")}>◆ Работа</button>
        </nav>

        <section className="sideSection">
          <div className="sectionHead"><span>ПРОЕКТЫ</span><button onClick={addProject}>＋</button></div>
          {data.projects.map(p => (
            <button key={p.id} className={"project " + (projectId === p.id ? "selected" : "")}
              onClick={() => {
                setProjectId(p.id);
                const c = data.chats.find(x => x.mode === mode && x.projectId === p.id);
                setChatId(c?.id || "");
              }}>
              ▱ {p.name}
            </button>
          ))}
        </section>

        {mode === "work" && (
          <section className="sideSection">
            <div className="sectionHead"><span>АССИСТЕНТЫ</span><button onClick={addAssistant}>＋</button></div>
            <button className={!assistantId ? "project selected" : "project"} onClick={() => setAssistantId("")}>✦ Без ассистента</button>
            {data.assistants.map(a => (
              <button key={a.id} className={"project " + (assistantId === a.id ? "selected" : "")}
                onClick={() => setAssistantId(a.id)}>✦ {a.name}</button>
            ))}
          </section>
        )}

        <section className="sideSection grow">
          <div className="sectionHead"><span>ЧАТЫ</span></div>
          {chats.map(c => (
            <button key={c.id} className={"chatLink " + (chatId === c.id ? "selected" : "")} onClick={() => {
              setChatId(c.id); setMobileMenu(false);
            }}>{c.title}</button>
          ))}
        </section>
      </aside>

      <section className="content">
        <header>
          <button className="hamb" onClick={() => setMobileMenu(v => !v)}>☰</button>
          <div className="crumb">
            <b>{mode === "chat" ? "Чат" : "Работа"}</b>
            <span> / {data.projects.find(p => p.id === projectId)?.name || "Проект"}</span>
            {mode === "work" && assistant && <span> / {assistant.name}</span>}
          </div>
          <select value={model} onChange={e => setModel(e.target.value)}>
            <option value="aven">AVEN</option>
            <option value="deepseek">DeepSeek</option>
            <option value="gpt">GPT</option>
            <option value="qwen">Qwen</option>
          </select>
        </header>

        <div className="conversation">
          {messages.length === 0 ? (
            <div className="hero">
              <div className="orb">SI</div>
              <h1>{mode === "chat" ? "Чем помочь?" : "Рабочее пространство"}</h1>
              <p>{mode === "chat"
                ? "Обычный чат для текста, изображений и документов."
                : "Работайте внутри проектов и подключайте собственных ассистентов."}</p>
              <div className="quick">
                <button onClick={() => setInput("Помоги разобраться с этим вопросом: ")}>Разобрать вопрос</button>
                <button onClick={() => fileRef.current?.click()}>Прикрепить файл</button>
                {mode === "work" && <button onClick={addAssistant}>Создать ассистента</button>}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((m, i) => (
                <article key={i} className={m.role}>
                  <div className="avatar">{m.role === "user" ? "ВЫ" : "SI"}</div>
                  <div className="bubble">{typeof m.content === "string" ? m.content : "[Сообщение с вложением]"}</div>
                </article>
              ))}
              {busy && <article className="assistant"><div className="avatar">SI</div><div className="bubble typing">Думаю…</div></article>}
            </div>
          )}
        </div>

        <div className="composerWrap">
          {attachments.length > 0 && (
            <div className="attachments">
              {attachments.map(a => <span key={a.id}>{a.name}<button onClick={() => setAttachments(x => x.filter(y => y.id !== a.id))}>×</button></span>)}
            </div>
          )}
          <div className="composer">
            <button className="attach" onClick={() => fileRef.current?.click()}>＋</button>
            <input ref={fileRef} type="file" multiple hidden accept="image/*,.pdf,.docx,.txt,.md,.json,.csv"
              onChange={e => upload([...e.target.files])} />
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={mode === "chat" ? "Сообщение SI BASE" : "Сообщение в рабочем проекте"} />
            <button className="send" disabled={busy} onClick={send}>↑</button>
          </div>
          <small className="hint">Enter — отправить · Shift+Enter — новая строка</small>
        </div>
      </section>

      {mobileMenu && <div className="backdrop" onClick={() => setMobileMenu(false)} />}
    </main>
  );
}
