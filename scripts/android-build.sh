#!/usr/bin/env bash
# Local stage-1 debug build. No SDK, key, APK, or credentials belong in git.
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK; required versions are in android/prototype-tooling.json}"
build_tools_version="$(node --input-type=module -e '
  import { readFileSync } from "node:fs";
  console.log(JSON.parse(readFileSync(process.argv[1], "utf8")).androidBuildTools);
' "$project_dir/android/prototype-tooling.json")"
export PROTOTYPE_KEYSTORE="${PROTOTYPE_KEYSTORE:-${HOME}/.android/fitness-planner-prototype.jks}"
export PROTOTYPE_KEYSTORE_PASSWORD="${PROTOTYPE_KEYSTORE_PASSWORD:-android}"
if [[ ! -f "$PROTOTYPE_KEYSTORE" ]]; then
  mkdir -p -- "$(dirname -- "$PROTOTYPE_KEYSTORE")"
  keytool -genkeypair -keystore "$PROTOTYPE_KEYSTORE" \
    -storepass:env PROTOTYPE_KEYSTORE_PASSWORD -keypass:env PROTOTYPE_KEYSTORE_PASSWORD \
    -alias prototype -keyalg RSA -keysize 3072 -validity 365 \
    -dname 'CN=Fitness Planner Private Prototype,O=Local Test' -noprompt
  chmod 600 -- "$PROTOTYPE_KEYSTORE"
fi
# Java does not automatically use HTTPS_PROXY. Preserve it, the existing Java options,
# and all inherited CA trust. These properties contain proxy host/port only.
if [[ -n "${HTTPS_PROXY:-}" ]]; then
  proxy_options="$(node --input-type=module -e '
    const p = new URL(process.env.HTTPS_PROXY);
    if (p.protocol !== "http:") throw new Error("Configure Java proxy settings for this proxy scheme");
    console.log(`-Dhttps.proxyHost=${p.hostname} -Dhttps.proxyPort=${p.port || 80} -Dhttp.proxyHost=${p.hostname} -Dhttp.proxyPort=${p.port || 80}`);
  ')"
  export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} ${proxy_options}"
fi
if [[ -f /etc/ssl/certs/java/cacerts && "${JAVA_TOOL_OPTIONS:-}" != *javax.net.ssl.trustStore=* ]]; then
  export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts"
fi
"$project_dir/android/gradlew" -p "$project_dir/android" --no-daemon --max-workers=2 --console=plain assembleDebug "$@"
apk="$project_dir/android/app/build/outputs/apk/debug/app-debug.apk"
"$ANDROID_HOME/build-tools/$build_tools_version/apksigner" verify --verbose --print-certs "$apk"
sha256sum "$apk"
printf 'Prototype APK: %s\n' "$apk"
