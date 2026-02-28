# Chrome OS Setup — MacBook Air M2 Terminal Machine 🖤

## What This Is
Chrome OS Flex on M2 MacBook Air 2022 → lightweight terminal + browser automation node.
No npm, no Node.js needed. Made in Heaven runs as a native Chrome Extension.

## Part 1 — Install Chrome OS Flex

### Create USB installer (from another Mac)
```bash
# Install Chromebook Recovery Utility from Chrome Web Store
# OR use command line:
# 1. Get ChromeOS Flex image from google.com/intl/en_us/chromebook/chrome-os-flex/
# 2. Flash to USB (8GB+):
diskutil list                          # find USB disk number (e.g. /dev/disk4)
diskutil unmountDisk /dev/disk4
# Drag downloaded .bin into Chromebook Recovery Utility
# OR use balenaEtcher
```

### Boot MacBook Air from USB
1. Insert USB
2. Hold **Option (⌥)** on boot → select USB drive
3. Select "Try ChromeOS Flex" first (no install needed to test)
4. If happy → "Install ChromeOS Flex" — **ERASES DISK**

### Post-install
- Sign in with Google account (gothravenllm@gmail.com)
- Settings → About Chrome OS → Check for updates
- WiFi → connect to your network
- Settings → Advanced → Developers → **Enable Linux development environment**

---

## Part 2 — Linux Container (Crostini) — Optional but powerful

The Linux container gives you a Debian terminal inside Chrome OS.
Use for: SSH to GCP, running OpenClaw, git operations.

```bash
# In the Linux terminal (after enabling):
sudo apt update && sudo apt upgrade -y

# Node.js + npm (for MIH Node version)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Git
sudo apt install -y git

# SSH keys (copy from main machine or generate new)
ssh-keygen -t ed25519 -C "ravenx-chromeos"
cat ~/.ssh/id_ed25519.pub   # add to GitHub + GCP

# Tailscale (join the cluster)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# OpenClaw
npm install -g openclaw

# Clone MIH
git clone git@github.com:DeadByDawn101/made-in-heaven.git ~/Projects/made-in-heaven
cd ~/Projects/made-in-heaven && npm install
```

---

## Part 3 — Install Made in Heaven Chrome Extension

### Load unpacked (development mode)
1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **"Load unpacked"**
4. Navigate to `chrome-os/extension/` in the MIH repo (or USB transfer it)
5. Extension appears in toolbar → pin it

### First launch
1. Click the 🖤 icon → side panel opens
2. Click **⚙ Settings** → paste your Anthropic API key (`sk-ant-...`)
3. Click **Save Settings**
4. Click **Attach Tab** → agent attaches to current tab
5. Type any command — Camila executes

### What works natively on Chrome OS
- Full browser automation (no DevTools MCP server needed)
- $STONEFREE curve monitoring (live ticker in header)
- Solana RPC calls (balance checks, token data)
- Jupiter quotes
- Web fetching + page scraping
- Tab management
- Persistent storage (API keys, empire data)

---

## Part 4 — Cluster Integration

### Join Tailscale
```bash
# In Linux terminal:
sudo tailscale up
# → shows as chromeos.beardie-ph.ts.net
# M4 Max and iMac Pro can SSH into it:
ssh user@chromeos.beardie-ph.ts.net
```

### SSH to GCP from Chrome OS
```bash
# In Linux terminal:
scp from MacBook: ~/.ssh/ravenx_gcp_qa to ~/.ssh/
chmod 600 ~/.ssh/ravenx_gcp_qa
ssh -i ~/.ssh/ravenx_gcp_qa ravenx@34.182.110.4
```

### Empire Node Role — MacBook Air M2
| Task | How |
|------|-----|
| Browser automation | Native Chrome Extension |
| Chat with Camila | Side panel always open |
| SSH to GCP | Linux terminal |
| Monitor $STONEFREE | Live ticker in extension |
| Light coding | Linux VSCode (via apt) |
| Remote desktop to M4 Max | Parsec (install via Linux) |

---

## 3-Machine Cluster Assessment

```
M4 Max (128GB)     → Primary brain | Heavy LLM | Main ops
iMac Pro (32GB)    → Node-01       | 7-13B models | Bots 24/7
MacBook Air M2     → Terminal      | Chrome automation | SSH hub | Monitoring
MacBook Pro (?)    → Node-02?      | Depends on RAM/chip
```

**Is MacBook Pro overkill?** Only if it has M2 Pro+ and 16GB+ RAM.
- M1 Pro / 16GB → useful as build machine / extra Ollama node
- M2 Max / 32GB → absolutely add it (second iMac-level inference node)
- Intel MacBook Pro → skip, power consumption not worth it

Rule: if it has Apple Silicon + 16GB+ RAM → it earns its place in the cluster.
If Intel → repurpose as Ubuntu CI/build server only.

---

## Performance on M2 MacBook Air (16GB)

| Task | Performance |
|------|------------|
| Chrome extension agent | ⚡ Instant (native browser) |
| Llama 3.2 3B (in Ollama) | ~40 tok/s — excellent |
| Llama 3.2 11B (in Ollama) | ~15 tok/s — good for background |
| Mistral 7B | ~20 tok/s |
| 70B models | ❌ Too large for 16GB |
| SSH terminal to GCP | ⚡ Instant via Tailscale |
| Browser automation | ⚡ Fastest in cluster (native Chrome OS) |

**Best use:** Terminal machine + browser agent + SSH hub + light model inference.
The M4 Max handles the heavy 70B+ models. The Air handles everything else.

---

*MacBook Air M2 Chrome OS = perfect lightweight cluster terminal. Zero overhead, always-on Chrome, native automation.* 🖤
