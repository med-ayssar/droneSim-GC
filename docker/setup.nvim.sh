#!/usr/bin/env bash
# =============================================================================
# setup.nvim.sh — Install Neovim (stable), LazyVim starter, LSPs & CLI tools
# =============================================================================
set -euo pipefail

USERNAME="${USERNAME:-drone}"
USER_HOME="/home/${USERNAME}"
HOST_ARCH="$(uname -m)"

echo "==> Installing Neovim (v0.12.4) + LazyVim + LSPs..."

case "${HOST_ARCH}" in
aarch64 | arm64)
  NVIM_ASSET="nvim-linux-arm64.tar.gz"
  NODE_ASSET="node-v20.18.3-linux-arm64.tar.xz"
  LUA_LS_ASSET="lua-language-server-3.15.0-linux-arm64.tar.gz"
  LAZYGIT_ARCH="arm64"
  STYLUA_ASSET="stylua-linux-aarch64.zip"
  FZF_ARCH="arm64"
  ;;
*)
  NVIM_ASSET="nvim-linux-x86_64.tar.gz"
  NODE_ASSET="node-v20.18.3-linux-x64.tar.xz"
  LUA_LS_ASSET="lua-language-server-3.15.0-linux-x64.tar.gz"
  LAZYGIT_ARCH="x86_64"
  STYLUA_ASSET="stylua-linux-x86_64.zip"
  FZF_ARCH="amd64"
  ;;
esac

# 1. Neovim binary (0.12.4)
NVIM_VER="v0.12.4"
NVIM_URL="https://github.com/neovim/neovim/releases/download/${NVIM_VER}/${NVIM_ASSET}"
rm -rf /opt/nvim /tmp/nvim-extract
mkdir -p /tmp/nvim-extract
wget -qO /tmp/nvim.tar.gz "${NVIM_URL}"
tar -xzf /tmp/nvim.tar.gz -C /tmp/nvim-extract
extracted="$(find /tmp/nvim-extract -mindepth 1 -maxdepth 1 -type d | head -1)"
mv "${extracted}" /opt/nvim
ln -sfn /opt/nvim/bin/nvim /usr/local/bin/nvim
rm -rf /tmp/nvim.tar.gz /tmp/nvim-extract
cat >/etc/profile.d/nvim.sh <<'EOF'
export PATH="/opt/nvim/bin:/opt/node/bin:/opt/lua-language-server/bin:${PATH}"
EOF
chmod 644 /etc/profile.d/nvim.sh

# 2. Node.js & npm LSPs / Formatters
if ! command -v node >/dev/null 2>&1; then
  echo "    installing Node.js..."
  wget -qO /tmp/node.tar.xz "https://nodejs.org/dist/v20.18.3/${NODE_ASSET}"
  mkdir -p /opt/node
  tar -xJf /tmp/node.tar.xz -C /opt/node --strip-components 1
  ln -sfn /opt/node/bin/node /usr/local/bin/node
  ln -sfn /opt/node/bin/npm /usr/local/bin/npm
  ln -sfn /opt/node/bin/npx /usr/local/bin/npx
  rm -f /tmp/node.tar.xz
fi
export PATH="/opt/node/bin:/usr/local/bin:${PATH}"
npm install -g vim-language-server bash-language-server tree-sitter-cli@0.24.7 pyright prettier

# 3. lua-language-server
if [[ ! -x /opt/lua-language-server/bin/lua-language-server ]]; then
  echo "    installing lua-language-server..."
  mkdir -p /opt/lua-language-server
  if wget -qO /tmp/lua-ls.tar.gz \
    "https://github.com/LuaLS/lua-language-server/releases/download/3.15.0/${LUA_LS_ASSET}"; then
    tar -xzf /tmp/lua-ls.tar.gz -C /opt/lua-language-server
    ln -sfn /opt/lua-language-server/bin/lua-language-server /usr/local/bin/lua-language-server
    rm -f /tmp/lua-ls.tar.gz
  else
    echo "    WARN: lua-language-server download failed; skipping"
  fi
fi

# 4. Lazygit (<space>gg git UI)
echo "    installing Lazygit..."
LAZYGIT_VER="0.44.1"
if wget -qO /tmp/lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/download/v${LAZYGIT_VER}/lazygit_${LAZYGIT_VER}_Linux_${LAZYGIT_ARCH}.tar.gz"; then
  tar -xzf /tmp/lazygit.tar.gz -C /tmp lazygit
  mv /tmp/lazygit /usr/local/bin/lazygit
  chmod +x /usr/local/bin/lazygit
  rm -f /tmp/lazygit.tar.gz
fi

# 5. StyLua (Lua formatter)
echo "    installing StyLua..."
STYLUA_VER="v0.20.0"
if wget -qO /tmp/stylua.zip "https://github.com/JohnnyMorganz/StyLua/releases/download/${STYLUA_VER}/${STYLUA_ASSET}"; then
  unzip -qo /tmp/stylua.zip -d /usr/local/bin
  chmod +x /usr/local/bin/stylua
  rm -f /tmp/stylua.zip
fi

# 6. fzf (latest v0.74.3)
echo "    installing latest fzf (v0.74.3)..."
FZF_VER="0.74.3"
if wget -qO /tmp/fzf.tar.gz "https://github.com/junegunn/fzf/releases/download/v${FZF_VER}/fzf-${FZF_VER}-linux_${FZF_ARCH}.tar.gz"; then
  tar -xzf /tmp/fzf.tar.gz -C /usr/local/bin fzf
  chmod +x /usr/local/bin/fzf
  rm -f /tmp/fzf.tar.gz
fi

# 7. Python packages (pynvim, ruff, black, isort, mypy, etc.)
echo "    installing Python nvim packages for ${USERNAME}..."
runuser -u "${USERNAME}" -- env HOME="${USER_HOME}" pip3 install --user --upgrade \
  pynvim \
  ruff \
  black \
  isort \
  mypy \
  'python-lsp-server[all]' \
  pylsp-mypy \
  python-lsp-isort \
  python-lsp-black \
  vim-vint

# 8. JetBrainsMono Nerd Font
echo "    installing JetBrainsMono Nerd Font..."
mkdir -p /usr/local/share/fonts/nerd
if wget -qO /tmp/JetBrainsMono.zip \
  "https://github.com/ryanoasis/nerd-fonts/releases/download/v3.3.0/JetBrainsMono.zip"; then
  unzip -qo /tmp/JetBrainsMono.zip -d /usr/local/share/fonts/nerd
  rm -f /tmp/JetBrainsMono.zip
  fc-cache -f >/dev/null 2>&1 || true
fi

# 9. Clone LazyVim starter template
NVIM_CONFIG_DIR="${USER_HOME}/.config/nvim"
echo "    cloning LazyVim starter template -> ${NVIM_CONFIG_DIR}"
runuser -u "${USERNAME}" -- mkdir -p "${USER_HOME}/.config"
if [[ -d "${NVIM_CONFIG_DIR}" ]]; then
  rm -rf "${NVIM_CONFIG_DIR}"
fi
runuser -u "${USERNAME}" -- git clone --depth=1 https://github.com/LazyVim/starter "${NVIM_CONFIG_DIR}"
rm -rf "${NVIM_CONFIG_DIR}/.git"

# 10. Configure C++ & CMake in LazyVim (clangd + clang-format, no DAP debugger)
echo "    configuring C++ (clangd, clang-format, cmake) in LazyVim..."
cat >"${NVIM_CONFIG_DIR}/lua/plugins/cpp.lua" <<'CPPLUA'
return {
  -- Configure clangd LSP (no DAP debugger)
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        mason = false,
        clangd = {
          cmd = {
            "clangd",
            "--background-index",
            "--clang-tidy",
            "--header-insertion=iwyu",
            "--completion-style=detailed",
            "--function-arg-placeholders",
            "--fallback-style=llvm",
          },
          init_options = {
            usePlaceholders = true,
            completeUnimported = true,
            clangdFileStatus = true,
          },
        },
      },
    },
  },
  -- Configure clang-format via conform.nvim
  {
    "stevearc/conform.nvim",
    opts = {
      formatters_by_ft = {
        c = { "clang-format" },
        cpp = { "clang-format" },
        objc = { "clang-format" },
        objcpp = { "clang-format" },
      },
    },
  },
}
CPPLUA

# Add clangd and cmake extras to lua/config/lazy.lua
if [[ -f "${NVIM_CONFIG_DIR}/lua/config/lazy.lua" ]]; then
  sed -i '/import = "plugins"/i \    { import = "lazyvim.plugins.extras.lang.clangd" },\n    { import = "lazyvim.plugins.extras.lang.cmake" },' "${NVIM_CONFIG_DIR}/lua/config/lazy.lua"
fi

chown -R "${USERNAME}:${USERNAME}" "${NVIM_CONFIG_DIR}"

# 11. Pre-clone lazy.nvim plugin manager
LAZY_DIR="${USER_HOME}/.local/share/nvim/lazy/lazy.nvim"
if [[ ! -d "${LAZY_DIR}" ]]; then
  runuser -u "${USERNAME}" -- mkdir -p "${USER_HOME}/.local/share/nvim/lazy"
  runuser -u "${USERNAME}" -- git clone --filter=blob:none https://github.com/folke/lazy.nvim.git --branch=stable "${LAZY_DIR}"
fi

# 12. Bootstrap LazyVim plugins (headless)
echo "    installing LazyVim plugins (this can take a few minutes)..."
runuser -u "${USERNAME}" -- env \
  HOME="${USER_HOME}" \
  LANG="en_US.UTF-8" \
  LC_ALL="en_US.UTF-8" \
  TERM="xterm-256color" \
  PATH="/opt/nvim/bin:/opt/node/bin:/opt/lua-language-server/bin:${USER_HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin" \
  nvim --headless -c "autocmd User LazySync quitall" -c "Lazy! sync" ||
  echo "    WARN: headless plugin install did not finish cleanly; first interactive nvim will finish it"

chown -R "${USERNAME}:${USERNAME}" "${USER_HOME}/.config" "${USER_HOME}/.local" "${USER_HOME}/.cache" || true

# Keep nvim on PATH for bash
if ! grep -q '/opt/nvim/bin' "${USER_HOME}/.bashrc" 2>/dev/null; then
  cat >>"${USER_HOME}/.bashrc" <<'BASHRC_NVIM'
export PATH="/opt/nvim/bin:/opt/node/bin:/opt/lua-language-server/bin:$HOME/.local/bin:$PATH"
export EDITOR=nvim
export VISUAL=nvim
alias vim=nvim
alias vi=nvim
BASHRC_NVIM
  chown "${USERNAME}:${USERNAME}" "${USER_HOME}/.bashrc"
fi

echo "==> Neovim setup complete!"
