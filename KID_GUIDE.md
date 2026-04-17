# Manuscript Editor: Super Easy Guide

This guide is written in very simple words.
Think of this app like a smart helper that fixes writing in your document.

---

## 1) What this app does

- You give it a `.txt` or `.docx` file.
- It fixes spelling, punctuation, and writing style.
- It can also use AI for better corrections.
- You can save:
  - a clean corrected file
  - a highlighted file (shows what changed)

---

## 2) What you need

- A computer with:
  - **Windows** or **Ubuntu**
  - **Python 3.8+**
- Internet is optional.
- Ollama is optional (only if you want local AI on your own PC).

---

## 3) Quick start on Windows

### Step A: Open project folder
- Open the folder `manuscript_editor`.

### Step B: Install Python packages
- Open Command Prompt inside this folder.
- Run:

```bat
pip install -r requirements.txt
```

### Step C: Start app
- Run:

```bat
run.bat
```

- Or:

```bat
python main.py
```

### Step D: Use it in your browser instead
- Run:

```bat
run_web.bat
```

- Then open:

```text
http://127.0.0.1:8000
```

---

## 4) Quick start on Ubuntu

### Step A: Open terminal in project folder

### Step B: Install Python packages

```bash
pip3 install -r requirements.txt
```

### Step C: Start app

```bash
./run.sh
```

- Or:

```bash
python3 main.py
```

### Step D: Use it in your browser instead

```bash
./run_web.sh
```

Then open:

```text
http://127.0.0.1:8000
```

---

## 5) Use the app (easy flow)

1. First time only: complete the **Setup Wizard**.
   - Choose AI provider
   - Add Ollama host or API key
   - Click **Save and Start**
2. Click **Browse Files** (or drag-drop file).
3. Choose your manuscript (`.txt` or `.docx`).
4. Choose options on left side.
5. Click **Process Document**.
6. Check tabs:
   - `Original`
   - `Corrected`
   - `Redline`
   - `Corrections`
7. Click:
   - **Save Clean Version**
   - **Save Highlighted**

---

## 6) AI options (simple)

- **No AI**: Works with built-in rules only.
- **Ollama (Local)**: AI runs on your machine.
- **Gemini/OpenRouter/Agent Router**: Cloud AI (needs API key).

If Ollama model is missing, install one:

```bash
ollama pull llama3.1
```

or

```bash
ollama pull gemma4
```

---

## 7) If something goes wrong

### “Please load a document first”
- Upload a file before pressing **Process Document**.

### “AI not available”
- AI key may be missing, or Ollama is not running.
- Start Ollama:

```bash
ollama serve
```

### App not opening
- Make sure dependencies are installed:

```bash
pip install -r requirements.txt
```

### Error says `No module named 'pkg_resources'`
- This usually means `setuptools` is missing.
- Run:

```bash
py -m pip install -r requirements.txt
```

---

## 8) One-line summary

Upload file -> click Process -> review corrected text -> save output.

---

## 9) Make a Windows installer (.exe)

On a Windows PC, in project folder:

1. Build app:
```bat
scripts\windows\build_exe.bat
```
2. Build installer:
```bat
scripts\windows\build_installer.bat
```

Installer file will be in:
`dist_installer\`

---

## 10) Make an Ubuntu installer (.deb)

On Ubuntu, in project folder:

```bash
./scripts/linux/build_deb.sh 1.0.0
```

Package file will be in:
`dist_deb/`
