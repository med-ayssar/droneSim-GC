#!/usr/bin/env bash
# =============================================================================
# post.setup.sh — make zsh the primary shell and install Oh My Zsh + plugins
# Mirrors the host ~/.zshrc stack used for autocomplete / suggestions:
#   plugins=(git zsh-autosuggestions zsh-syntax-highlighting zsh-bat docker-compose)
#   ZSH_THEME="gnzh"
# =============================================================================
set -euo pipefail

USERNAME="${USERNAME:-drone}"
USER_HOME="/home/${USERNAME}"
export DEBIAN_FRONTEND=noninteractive

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: post.setup.sh must run as root (needs chsh / apt)." >&2
  exit 1
fi

echo "==> Installing zsh, bat (for zsh-bat), and shell helpers..."
apt-get update
apt-get install -y --no-install-recommends \
  locales \
  zsh \
  bat \
  git \
  curl \
  ca-certificates \
  unzip \
  tar \
  xz-utils \
  ripgrep \
  fd-find \
  xclip \
  python3-pip \
  python3-venv \
  fontconfig
rm -rf /var/lib/apt/lists/*

echo "==> Generating en_US.UTF-8 locale..."
locale-gen en_US.UTF-8
update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# Ubuntu names the fd binary fdfind
if command -v fdfind >/dev/null 2>&1 && ! command -v fd >/dev/null 2>&1; then
  ln -sf "$(command -v fdfind)" /usr/local/bin/fd
fi

# Ensure unversioned clangd, clang-format, and clang-tidy exist on PATH for Neovim / editors
for tool in clangd clang-format clang-tidy clang clang++; do
  if command -v "${tool}-18" >/dev/null 2>&1; then
    ln -sf "$(command -v "${tool}-18")" "/usr/local/bin/${tool}"
  fi
done

ZSH_BIN="$(command -v zsh)"
if [[ -z "${ZSH_BIN}" ]]; then
  echo "ERROR: zsh not found after install." >&2
  exit 1
fi

echo "==> Setting zsh as login shell for ${USERNAME}..."
chsh -s "${ZSH_BIN}" "${USERNAME}"
# Also keep root usable with zsh if desired; primary target is the drone user.
usermod -s "${ZSH_BIN}" "${USERNAME}"

# On Debian/Ubuntu, the bat binary is often named batcat.
if command -v batcat >/dev/null 2>&1 && ! command -v bat >/dev/null 2>&1; then
  ln -sf "$(command -v batcat)" /usr/local/bin/bat
fi

echo "==> Installing Oh My Zsh for ${USERNAME}..."
# RUNZSH=no / CHSH=no: non-interactive install; we already set the shell.
runuser -u "${USERNAME}" -- env HOME="${USER_HOME}" \
  RUNZSH=no CHSH=no KEEP_ZSHRC=yes \
  sh -c 'curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh | sh'

OMZ_DIR="${USER_HOME}/.oh-my-zsh"
CUSTOM_PLUGINS="${OMZ_DIR}/custom/plugins"
mkdir -p "${CUSTOM_PLUGINS}"
chown -R "${USERNAME}:${USERNAME}" "${OMZ_DIR}"

clone_plugin() {
  local name="$1"
  local url="$2"
  local dest="${CUSTOM_PLUGINS}/${name}"
  if [[ -d "${dest}/.git" ]]; then
    echo "    plugin ${name}: already present, pulling..."
    runuser -u "${USERNAME}" -- git -C "${dest}" pull --ff-only || true
  else
    echo "    plugin ${name}: cloning..."
    rm -rf "${dest}"
    runuser -u "${USERNAME}" -- git clone --depth 1 "${url}" "${dest}"
  fi
}

echo "==> Installing custom Oh My Zsh plugins (autocomplete + suggestions)..."
# zsh-autosuggestions  → grey inline suggestions from history
# zsh-syntax-highlighting → command syntax colors (load last among highlight plugins)
# zsh-bat              → cat → bat for highlighted file dumps
clone_plugin zsh-autosuggestions   https://github.com/zsh-users/zsh-autosuggestions
clone_plugin zsh-syntax-highlighting https://github.com/zsh-users/zsh-syntax-highlighting.git
clone_plugin zsh-bat               https://github.com/fdellwing/zsh-bat.git

echo "==> Writing ${USER_HOME}/.zshrc (based on host config)..."
cat > "${USER_HOME}/.zshrc" <<'ZSHRC'
# Path to your Oh My Zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Theme (matches host ~/.zshrc)
ZSH_THEME="gnzh"

# Plugins (matches host ~/.zshrc)
# - git: aliases / completion
# - zsh-autosuggestions: fish-like autocomplete suggestions
# - zsh-syntax-highlighting: live command highlighting (keep near end)
# - zsh-bat: syntax-highlighted cat via bat
# - docker-compose: compose completion / aliases
plugins=(git zsh-autosuggestions zsh-syntax-highlighting zsh-bat docker-compose)

source "$ZSH/oh-my-zsh.sh"

# History (matches host ~/.zshrc)
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt appendhistory

# Autosuggestion UX
ZSH_AUTOSUGGEST_STRATEGY=(history completion)
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=8'

# ROS 2 + PX4 workspace (container environment)
if [[ -f /opt/ros/lyrical/setup.zsh ]]; then
  source /opt/ros/lyrical/setup.zsh
elif [[ -f /opt/ros/lyrical/setup.bash ]]; then
  source /opt/ros/lyrical/setup.bash
elif [[ -f /opt/ros/jazzy/setup.zsh ]]; then
  source /opt/ros/jazzy/setup.zsh
elif [[ -f /opt/ros/jazzy/setup.bash ]]; then
  source /opt/ros/jazzy/setup.bash
elif [[ -f /opt/ros/humble/setup.zsh ]]; then
  source /opt/ros/humble/setup.zsh
elif [[ -f /opt/ros/humble/setup.bash ]]; then
  source /opt/ros/humble/setup.bash
fi

if [[ -f "$HOME/Tools/install/px4_msgs/setup.zsh" ]]; then
  source "$HOME/Tools/install/px4_msgs/setup.zsh"
elif [[ -f "$HOME/Tools/install/px4_msgs/setup.bash" ]]; then
  source "$HOME/Tools/install/px4_msgs/setup.bash"
fi

# Terminal color support (prevents arrow key escape sequence issues)
export TERM="${TERM:-xterm-256color}"

# :1 = KasmVNC virtual display; use DISPLAY=:0 for WSL/Windows host display
export DISPLAY="${DISPLAY:-:1}"

# Handy aliases for this project
alias px4='cd ~/Tools/PX4-Autopilot'
alias pkgs='cd ~/packages'
alias colcon-build='colcon build --symlink-install'

# Neovim (jdhao/nvim-config) + user pip / node bins
export PATH="/opt/nvim/bin:/opt/node/bin:/opt/lua-language-server/bin:$HOME/.local/bin:$PATH"
export EDITOR=nvim
export VISUAL=nvim
alias vim=nvim
alias vi=nvim
ZSHRC

chown "${USERNAME}:${USERNAME}" "${USER_HOME}/.zshrc"
chmod 644 "${USER_HOME}/.zshrc"

# Ensure login shells pick up zshrc
if [[ ! -f "${USER_HOME}/.zprofile" ]] || ! grep -q '\.zshrc' "${USER_HOME}/.zprofile" 2>/dev/null; then
  cat >> "${USER_HOME}/.zprofile" <<'ZPROFILE'
# Load interactive config for login shells (SSH / VNC terminals)
[[ -f ~/.zshrc ]] && source ~/.zshrc
ZPROFILE
  chown "${USERNAME}:${USERNAME}" "${USER_HOME}/.zprofile"
fi

# Keep bash usable as a fallback, but point profile at zsh preference
if [[ -f "${USER_HOME}/.profile" ]]; then
  if ! grep -q 'exec zsh' "${USER_HOME}/.profile" 2>/dev/null; then
    cat >> "${USER_HOME}/.profile" <<'PROFILE'

# Prefer zsh when available and this is an interactive shell
if [ -n "$PS1" ] && [ -z "$ZSH_VERSION" ] && [ -t 0 ] && command -v zsh >/dev/null 2>&1; then
  export SHELL="$(command -v zsh)"
  exec zsh -l
fi
PROFILE
  fi
  chown "${USERNAME}:${USERNAME}" "${USER_HOME}/.profile"
fi

echo "==> zsh setup complete for ${USERNAME}"
echo "    shell:  $(getent passwd "${USERNAME}" | cut -d: -f7)"
echo "    theme:  gnzh"
echo "    plugins: git zsh-autosuggestions zsh-syntax-highlighting zsh-bat docker-compose"

# =============================================================================
# Run Neovim + LazyVim Setup (setup.nvim.sh)
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/setup.nvim.sh" ]]; then
  echo "==> Invoking ${SCRIPT_DIR}/setup.nvim.sh..."
  USERNAME="${USERNAME}" bash "${SCRIPT_DIR}/setup.nvim.sh"
elif [[ -f /tmp/setup.nvim.sh ]]; then
  echo "==> Invoking /tmp/setup.nvim.sh..."
  USERNAME="${USERNAME}" bash /tmp/setup.nvim.sh
else
  echo "WARN: setup.nvim.sh not found" >&2
fi
