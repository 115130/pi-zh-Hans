#!/usr/bin/env bash
#
# 在本地构建所有平台的 pi 二进制文件。
# 镜像 .github/workflows/build-binaries.yml
#
# 用法：
#   ./scripts/build-binaries.sh [--skip-install] [--skip-deps] [--skip-build] [--platform <platform>] [--out <dir>]
#
# 选项：
#   --skip-install      跳过 npm ci
#   --skip-deps         跳过安装跨平台依赖
#   --skip-build        跳过 npm run build
#   --platform <名称>   仅为指定平台构建（darwin-arm64、darwin-x64、linux-x64、linux-arm64、windows-x64、windows-arm64）
#   --out <目录>        输出目录（默认：packages/coding-agent/binaries）
#
# 输出：
#   packages/coding-agent/binaries/
#     pi-darwin-arm64.tar.gz
#     pi-darwin-x64.tar.gz
#     pi-linux-x64.tar.gz
#     pi-linux-arm64.tar.gz
#     pi-windows-x64.zip
#     pi-windows-arm64.zip

set -euo pipefail

cd "$(dirname "$0")/.."

SKIP_INSTALL=false
SKIP_DEPS=false
SKIP_BUILD=false
PLATFORM=""
OUTPUT_DIR=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        --out)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        *)
            echo "未知选项：$1"
            exit 1
            ;;
    esac
done

# 验证指定的平台
if [[ -n "$PLATFORM" ]]; then
    case "$PLATFORM" in
        darwin-arm64|darwin-x64|linux-x64|linux-arm64|windows-x64|windows-arm64)
            ;;
        *)
            echo "无效平台：$PLATFORM"
            echo "有效平台：darwin-arm64、darwin-x64、linux-x64、linux-arm64、windows-x64、windows-arm64"
            exit 1
            ;;
    esac
fi

if [[ -z "$OUTPUT_DIR" ]]; then
    OUTPUT_DIR="packages/coding-agent/binaries"
fi
if [[ "$OUTPUT_DIR" != /* ]]; then
    OUTPUT_DIR="$(pwd)/$OUTPUT_DIR"
fi

if [[ "$SKIP_INSTALL" == "false" ]]; then
    echo "==> 安装依赖..."
    npm ci --ignore-scripts
else
    echo "==> 跳过 npm ci（--skip-install）"
fi

if [[ "$SKIP_DEPS" == "false" ]]; then
    echo "==> 安装跨平台原生绑定..."
    # npm ci 仅为当前平台安装可选依赖
    # 我们需要所有平台绑定用于 bun 交叉编译
    # 使用 --force 绕过平台检查（package.json 中的 os/cpu 限制）
    # 一次安装所有依赖，避免 npm 移除先前安装的包
    npm install --no-save --package-lock=false --force --ignore-scripts \
        @mariozechner/clipboard-darwin-arm64@0.3.6 \
        @mariozechner/clipboard-darwin-x64@0.3.6 \
        @mariozechner/clipboard-linux-x64-gnu@0.3.6 \
        @mariozechner/clipboard-linux-arm64-gnu@0.3.6 \
        @mariozechner/clipboard-win32-x64-msvc@0.3.6 \
        @mariozechner/clipboard-win32-arm64-msvc@0.3.6
else
    echo "==> 跳过跨平台原生绑定（--skip-deps）"
fi

if [[ "$SKIP_BUILD" == "false" ]]; then
    echo "==> 构建所有包..."
    npm run build
else
    echo "==> 跳过包构建（--skip-build）"
fi

echo "==> 构建二进制文件..."
cd packages/coding-agent

# 清理之前的构建
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"/{darwin-arm64,darwin-x64,linux-x64,linux-arm64,windows-x64,windows-arm64}

# 确定要构建的平台
if [[ -n "$PLATFORM" ]]; then
    PLATFORMS=("$PLATFORM")
else
    PLATFORMS=(darwin-arm64 darwin-x64 linux-x64 linux-arm64 windows-x64 windows-arm64)
fi

for platform in "${PLATFORMS[@]}"; do
    echo "为 $platform 构建..."
    # Bun 编译的可执行文件仅在将 worker 脚本作为显式构建入口点传递时嵌入它们。
    # 运行时仍可使用 new URL(...)，但 worker 必须存在于编译后的可执行文件中。
    if [[ "$platform" == windows-* ]]; then
        bun build --compile --target=bun-$platform ./dist/bun/cli.js ./src/utils/image-resize-worker.ts --outfile "$OUTPUT_DIR/$platform/pi.exe"
    else
        bun build --compile --target=bun-$platform ./dist/bun/cli.js ./src/utils/image-resize-worker.ts --outfile "$OUTPUT_DIR/$platform/pi"
    fi
done

echo "==> 创建发布归档..."

# 将共享文件复制到每个平台目录
for platform in "${PLATFORMS[@]}"; do
    cp package.json "$OUTPUT_DIR/$platform/"
    cp README.md "$OUTPUT_DIR/$platform/"
    cp CHANGELOG.md "$OUTPUT_DIR/$platform/"
    cp ../../node_modules/@silvia-odwyer/photon-node/photon_rs_bg.wasm "$OUTPUT_DIR/$platform/"
    mkdir -p "$OUTPUT_DIR/$platform/theme"
    cp dist/modes/interactive/theme/*.json "$OUTPUT_DIR/$platform/theme/"
    mkdir -p "$OUTPUT_DIR/$platform/assets"
    cp dist/modes/interactive/assets/* "$OUTPUT_DIR/$platform/assets/"
    cp -r dist/core/export-html "$OUTPUT_DIR/$platform/"
    cp -r docs "$OUTPUT_DIR/$platform/"
    cp -r examples "$OUTPUT_DIR/$platform/"

    case "$platform" in
        darwin-arm64)
            clipboard_native_package="clipboard-darwin-arm64"
            ;;
        darwin-x64)
            clipboard_native_package="clipboard-darwin-x64"
            ;;
        linux-x64)
            clipboard_native_package="clipboard-linux-x64-gnu"
            ;;
        linux-arm64)
            clipboard_native_package="clipboard-linux-arm64-gnu"
            ;;
        windows-x64)
            clipboard_native_package="clipboard-win32-x64-msvc"
            ;;
        windows-arm64)
            clipboard_native_package="clipboard-win32-arm64-msvc"
            ;;
    esac
    mkdir -p "$OUTPUT_DIR/$platform/node_modules/@mariozechner"
    cp -r ../../node_modules/@mariozechner/clipboard "$OUTPUT_DIR/$platform/node_modules/@mariozechner/"
    cp -r ../../node_modules/@mariozechner/$clipboard_native_package "$OUTPUT_DIR/$platform/node_modules/@mariozechner/"

    # 将终端输入原生辅助程序复制到编译后的二进制文件旁边。
    if [[ "$platform" == darwin-* ]]; then
        mkdir -p "$OUTPUT_DIR/$platform/native/darwin/prebuilds/$platform"
        cp ../tui/native/darwin/prebuilds/$platform/darwin-modifiers.node "$OUTPUT_DIR/$platform/native/darwin/prebuilds/$platform/"
    fi
    if [[ "$platform" == windows-* ]]; then
        if [[ "$platform" == "windows-arm64" ]]; then
            win32_arch_dir="win32-arm64"
        else
            win32_arch_dir="win32-x64"
        fi
        mkdir -p "$OUTPUT_DIR/$platform/native/win32/prebuilds/$win32_arch_dir"
        cp ../tui/native/win32/prebuilds/$win32_arch_dir/win32-console-mode.node "$OUTPUT_DIR/$platform/native/win32/prebuilds/$win32_arch_dir/"
    fi
done

# 创建归档
cd "$OUTPUT_DIR"

for platform in "${PLATFORMS[@]}"; do
    if [[ "$platform" == windows-* ]]; then
        # Windows（zip）
        echo "创建 pi-$platform.zip..."
        (cd "$platform" && zip -r ../pi-$platform.zip .)
    else
        # Unix 平台（tar.gz）— 使用包装目录以兼容 mise
        echo "创建 pi-$platform.tar.gz..."
        mv "$platform" pi && tar -czf pi-$platform.tar.gz pi && mv pi "$platform"
    fi
done

# 提取归档以便于本地测试
echo "==> 提取归档用于测试..."
for platform in "${PLATFORMS[@]}"; do
    rm -rf "$platform"
    if [[ "$platform" == windows-* ]]; then
        mkdir -p "$platform" && (cd "$platform" && unzip -q ../pi-$platform.zip)
    else
        tar -xzf pi-$platform.tar.gz && mv pi "$platform"
    fi
done

echo ""
echo "==> 构建完成！"
echo "归档文件位于 $OUTPUT_DIR/"
ls -lh *.tar.gz *.zip 2>/dev/null || true
echo ""
echo "已提取的测试目录："
for platform in "${PLATFORMS[@]}"; do
    if [[ "$platform" == windows-* ]]; then
        echo "  $OUTPUT_DIR/$platform/pi.exe"
    else
        echo "  $OUTPUT_DIR/$platform/pi"
    fi
done
