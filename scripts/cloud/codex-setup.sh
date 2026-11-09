#!/usr/bin/env bash
# Codex Cloud install script for GandalfTheJunior/mtg-commander-stats.
# Designed for the Linux x64 cloud environment, not for local macOS execution.
set -euo pipefail

SETUP=/workspace/.cloud-setup
REPO=/workspace/mtg-commander-stats
mkdir -p "$SETUP/downloads" "$SETUP/jdk" "$SETUP/node" "$SETUP/m2" "$HOME/.m2"

[[ "$(uname -m)" == x86_64 ]] || { echo 'Linux x64 required.' >&2; exit 1; }
mkdir -p "$SETUP/maven" "$SETUP/npm-cache" "$HOME/.local/bin"
# User-owned persistent caches; never delete or recursively chmod shared caches.
for dir in "$SETUP/m2" "$SETUP/maven" "$SETUP/npm-cache"; do
  probe="$(mktemp "$dir/.write-check.XXXXXX")"
  rm -f "$probe"
done

# Java 25 (Oracle Linux x64), checksum verified before extraction.
if [[ ! -x "$SETUP/jdk/bin/java" ]] || ! "$SETUP/jdk/bin/java" -version 2>&1 | head -1 | grep -Eq '"25([."])'; then
  JDK_URL=https://download.oracle.com/java/25/latest/jdk-25_linux-x64_bin.tar.gz
  curl -fsSL --retry 3 "$JDK_URL" -o "$SETUP/downloads/jdk25.tar.gz"
  curl -fsSL --retry 3 "$JDK_URL.sha256" -o "$SETUP/downloads/jdk25.sha256"
  python3 - <<'PY'
from hashlib import file_digest
from pathlib import Path
p = Path('/workspace/.cloud-setup/downloads')
with (p / 'jdk25.tar.gz').open('rb') as f:
    actual = file_digest(f, 'sha256').hexdigest()
expected = (p / 'jdk25.sha256').read_text().split()[0]
if actual != expected:
    raise SystemExit('JDK 25 checksum mismatch')
PY
  tar -xzf "$SETUP/downloads/jdk25.tar.gz" -C "$SETUP/jdk" --strip-components=1
  rm -f "$SETUP/downloads/jdk25.tar.gz" "$SETUP/downloads/jdk25.sha256"
fi

# Install a persistent Node 24 binary; do not depend on nvm/mise being installed.
if [[ ! -x "$SETUP/node/bin/node" ]] || [[ "$("$SETUP/node/bin/node" -p 'process.versions.node.split(".")[0]')" != 24 ]]; then
  NODE_URL=https://nodejs.org/dist/latest-v24.x
  curl -fsSL --retry 3 "$NODE_URL/SHASUMS256.txt" -o "$SETUP/downloads/SHASUMS256.txt"
  NODE_ARCHIVE="$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ { print $2; exit }' "$SETUP/downloads/SHASUMS256.txt")"
  if [[ -z "$NODE_ARCHIVE" ]]; then
    echo 'Could not identify the Node 24 Linux x64 archive.' >&2
    exit 1
  fi
  curl -fsSL --retry 3 "$NODE_URL/$NODE_ARCHIVE" -o "$SETUP/downloads/$NODE_ARCHIVE"
  (cd "$SETUP/downloads" && awk -v name="$NODE_ARCHIVE" '$2 == name { print $1 "  " $2 }' SHASUMS256.txt | sha256sum -c -)
  rm -rf "$SETUP/node"
  mkdir -p "$SETUP/node"
  tar -xJf "$SETUP/downloads/$NODE_ARCHIVE" -C "$SETUP/node" --strip-components=1
  rm -f "$SETUP/downloads/$NODE_ARCHIVE" "$SETUP/downloads/SHASUMS256.txt"
fi

# JAVA_HOME alone does not select the java command in a noninteractive shell.
# ~/.local/bin is first in the default cloud agent login shell PATH.
# A bare non-login shell needs BASH_ENV=$SETUP/env.sh (if allowed by the UI).
for tool in java javac jar javadoc jshell; do
  ln -sfn "$SETUP/jdk/bin/$tool" "$HOME/.local/bin/$tool"
done
for tool in node npm npx; do
  ln -sfn "$SETUP/node/bin/$tool" "$HOME/.local/bin/$tool"
done
export PATH="$HOME/.local/bin:$PATH"
export JAVA_HOME="$SETUP/jdk"
export MAVEN_USER_HOME="$SETUP/maven"
export MAVEN_ARGS="-s $SETUP/maven-settings.xml"
export MAVEN_OPTS="-Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts"
export NPM_CONFIG_CACHE="$SETUP/npm-cache"

# Maven chooses proxies by destination protocol (HTTPS), not proxy URL scheme.
python3 - <<'PY'
import os
from pathlib import Path
from urllib.parse import urlsplit
import xml.etree.ElementTree as E
root = E.Element('settings', xmlns='http://maven.apache.org/SETTINGS/1.2.0')
E.SubElement(root, 'localRepository').text = '/workspace/.cloud-setup/m2'
proxies = E.SubElement(root, 'proxies')
for protocol in ('http', 'https'):
    raw = (os.environ.get(protocol.upper() + '_PROXY')
           or os.environ.get(protocol + '_proxy') or '')
    if not raw:
        continue
    u = urlsplit(raw)
    if u.scheme != 'http' or not u.hostname or u.username or u.password:
        raise SystemExit('Expected an unauthenticated HTTP CONNECT cloud proxy')
    proxy = E.SubElement(proxies, 'proxy')
    for key, value in {
        'id': 'cloud-' + protocol, 'active': 'true', 'protocol': protocol,
        'host': u.hostname, 'port': str(u.port or 80),
        'nonProxyHosts': 'localhost|127.0.0.1|[::1]',
    }.items():
        E.SubElement(proxy, key).text = value
path = Path('/workspace/.cloud-setup/maven-settings.xml')
E.indent(root)
E.ElementTree(root).write(path, encoding='unicode', xml_declaration=True)
path.chmod(0o600)
PY

# Compatibility for retained startup instructions; not required by agent shells.
cat > "$SETUP/env.sh" <<'MTG_ENV'
export JAVA_HOME=/workspace/.cloud-setup/jdk
export PATH="$HOME/.local/bin:$PATH"
export MAVEN_USER_HOME=/workspace/.cloud-setup/maven
export MAVEN_ARGS="-s /workspace/.cloud-setup/maven-settings.xml"
export MAVEN_OPTS="-Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts"
export NPM_CONFIG_CACHE=/workspace/.cloud-setup/npm-cache
mtg_mvn() { ./mvnw -B "$@"; }
MTG_ENV

npm config set cache "$SETUP/npm-cache" --location=user
npm config set cafile /etc/ssl/certs/ca-certificates.crt --location=user
java -version
node --version
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 24 ]]
cd "$REPO/backend"
./mvnw -version
./mvnw -B -DskipTests package
cd "$REPO/frontend"
npm ci --no-audit --no-fund
npm run build
# Docker images are acquired on demand when services/tests actually need them.
# No Docker download is necessary for installation or these build checks.
echo 'Codex Cloud setup complete.'
