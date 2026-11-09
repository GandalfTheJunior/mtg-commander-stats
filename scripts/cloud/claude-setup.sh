#!/usr/bin/env bash
# Claude Code Cloud toolchain for GandalfTheJunior/mtg-commander-stats.
# Anthropic-hosted Ubuntu 24.04, Linux x86_64; cloud only, not local macOS.
set -Eeuo pipefail

[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || {
  echo 'This setup requires Linux x86_64.' >&2
  exit 1
}

ROOT=/opt/mtg-claude-cloud
mkdir -p "$ROOT"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# JDK 25: verify Oracle's published SHA-256 before extraction.
if [[ ! -x "$ROOT/jdk/bin/java" ]] || \
   ! "$ROOT/jdk/bin/java" -version 2>&1 | grep -Eq '"25([."])'; then
  JDK_URL=https://download.oracle.com/java/25/latest/jdk-25_linux-x64_bin.tar.gz
  curl -fsSL --retry 3 "$JDK_URL" -o "$WORK/jdk.tar.gz"
  curl -fsSL --retry 3 "$JDK_URL.sha256" -o "$WORK/jdk.sha256"
  JDK_HASH=$(awk 'NR == 1 {print $1}' "$WORK/jdk.sha256")
  printf '%s  %s\n' "$JDK_HASH" "$WORK/jdk.tar.gz" | sha256sum --check --status
  mkdir -p "$WORK/jdk"
  tar -xzf "$WORK/jdk.tar.gz" -C "$WORK/jdk" --strip-components=1
  "$WORK/jdk/bin/java" -version 2>&1 | grep -Eq '"25([."])'
  rm -rf "$ROOT/jdk"
  mv "$WORK/jdk" "$ROOT/jdk"
fi

# Node.js 24: select the current official Linux x64 tarball by its checksum list.
if [[ ! -x "$ROOT/node/bin/node" ]] || \
   [[ "$("$ROOT/node/bin/node" -p 'process.versions.node.split(".")[0]')" != 24 ]]; then
  NODE_URL=https://nodejs.org/dist/latest-v24.x
  curl -fsSL --retry 3 "$NODE_URL/SHASUMS256.txt" -o "$WORK/SHASUMS256.txt"
  NODE_TARBALL=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2; exit}' "$WORK/SHASUMS256.txt")
  [[ -n "$NODE_TARBALL" ]] || { echo 'Could not find Node 24 x64 tarball.' >&2; exit 1; }
  curl -fsSL --retry 3 "$NODE_URL/$NODE_TARBALL" -o "$WORK/$NODE_TARBALL"
  (cd "$WORK" && awk -v name="$NODE_TARBALL" '$2 == name {print; found=1} END {if (!found) exit 1}' SHASUMS256.txt | sha256sum --check --status)
  mkdir -p "$WORK/node"
  tar -xJf "$WORK/$NODE_TARBALL" -C "$WORK/node" --strip-components=1
  [[ "$("$WORK/node/bin/node" -p 'process.versions.node.split(".")[0]')" == 24 ]]
  rm -rf "$ROOT/node"
  mv "$WORK/node" "$ROOT/node"
fi

# Claude Code sources this file before every Bash-tool command when
# CLAUDE_ENV_FILE=/opt/mtg-claude-cloud/env.sh is set on the cloud environment.
# Let npm use its default user-owned cache under $HOME (rather than /opt).
cat > "$ROOT/env.sh" <<'ENV'
export JAVA_HOME=/opt/mtg-claude-cloud/jdk
export PATH="/opt/mtg-claude-cloud/jdk/bin:/opt/mtg-claude-cloud/node/bin:$PATH"
ENV

# Additional convenience for login shells; do not alter the vendor Node 22 tree.
cp "$ROOT/env.sh" /etc/profile.d/mtg-claude-cloud.sh
for tool in java javac jar javadoc jshell; do
  ln -sfn "$ROOT/jdk/bin/$tool" "/usr/local/bin/$tool"
done
for tool in node npm npx; do
  ln -sfn "$ROOT/node/bin/$tool" "/usr/local/bin/$tool"
done

# Verify the provisioned tools inside this setup process.
# Project dependency installation and integration tests run in cloud tasks,
# not during environment provisioning (to preserve the setup cache budget).
source "$ROOT/env.sh"
java -version
node --version
npm --version
echo 'Claude Code cloud toolchain setup complete.'
