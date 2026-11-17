# Installing Maya on Windows

Setup takes 20–45 minutes on a typical connection, mostly spent downloading. Everything Maya needs is installed for you, including the humaniser.

## 1. Download and install

1. Download **[Maya-Setup.exe](https://github.com/shahaman098/maya/releases/latest/download/Maya-Setup.exe)**.
2. Open the file. Maya installs itself and opens. There are no installer pages to click through, and you don't need an administrator password.
3. If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**. You'll see this because the installer isn't code-signed yet.

Maya adds shortcuts to your desktop and Start menu.

## 2. Choose where the AI runs

The first time Maya opens, it checks your computer and recommends one of two options.

### Option A: Run on this computer (free and private)

Best if your PC has 16 GB+ of memory and a graphics card, or 24 GB+ of memory.

1. Click **Run on this computer**.
2. Click **Install everything**. Maya then:
   - downloads and installs Ollama, the program that runs the AI (it checks that the download is signed by Ollama first),
   - starts Ollama in the background,
   - downloads the writer model (6.6 GB), the matching model (45 MB) and the humaniser (7.6 GB).
3. Leave Maya open until every step has a green tick. If a step fails, click **Retry**. Steps that are already finished are skipped.
4. Next, you can add a cloud API key as a faster backup. This is optional, so click **Skip for now** if you don't want one.

### Option B: Use a cloud API key (fast on any PC)

Best for laptops with 8–12 GB of memory or no graphics card.

1. Click **Use a cloud API key**.
2. Pick a provider: OpenAI, OpenRouter, DeepSeek or Groq.
3. Click **Get your … key**. The provider's site opens in your browser. Sign in, add billing if asked, and copy the key.
4. Paste the key into Maya and click **Test and save**. Maya checks that the key works before saving it.
5. Click **Install everything**. Rewrites go through your key, but Maya still installs Ollama on your PC along with the matching model (45 MB) and the humaniser (7.6 GB). The matching model picks which of your samples fit each draft. Leave Maya open until every step has a green tick.

The humaniser runs on your PC on both routes. It's a 12B model that needs about 10 GB of free memory; if your PC has less, untick **Include the humaniser** to save the download.

The key is stored only in Maya's database on your computer. Your writing samples and history stay on your computer as well; only the drafts you rewrite are sent to the provider.

## 3. Your first rewrite

1. **Add your writing.** Go to **Voice** and paste or import 10–20 things you've written, such as messages, emails or paragraphs from essays.
2. **Build your voice.** On the Voice page, click **Refresh profile**.
3. **Rewrite.** Go to **Write**, paste a draft, and click **Rewrite in my voice**.

## Changing things later

- **Settings → Writer** switches between local and cloud, changes the provider or model, and tests the connection.
- **Settings → Run setup again** reopens the setup guide.
- Your data is stored at `%APPDATA%\Maya\maya.db`. Uninstalling Maya leaves it in place.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Ollama is installed but did not start" | Open **Ollama** from the Start menu, then click **Retry** in Maya. |
| The model download stops partway | Check your internet connection and click **Retry**. The download resumes where it stopped. |
| "The provider did not accept that key" | Check that you copied the whole key and that billing is enabled on the provider's site. |
| Where is the humaniser? | Open **Lab**. It's switched on there as the comparison model. |
| Rewrites are very slow on the local model | Your PC may not have enough memory. Go to **Settings → Writer** and switch to a cloud API. |
| Maya won't open | The error message shows where the log file is (`%APPDATA%\Maya\server.log`). Send that file along with your bug report. |
