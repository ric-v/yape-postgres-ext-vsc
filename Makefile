.PHONY: all clean install build package publish publish-ovsx

# Default target
all: clean install build package

# Clean build artifacts
clean:
	rm -rf out dist *.vsix node_modules

# Install dependencies
install:
	yarn install

# Build the extension
build:
	yarn run vscode:prepublish

# Package the extension
package: build
	vsce package

# publish the extension to VS Code Marketplace and Open VSX Registry
publish: package
	@echo "Publishing to VS Code Marketplace..."
	test -f ./pat || (echo "Error: pat file not found" && exit 1)
	vsce publish -p $(shell cat ./pat)
	@echo "Publishing to VS Code Marketplace..."

	@echo "Publishing to Open VSX Registry..."
	test -f ./pat-open-vsx || (echo "Error: pat-open-vsx file not found" && exit 1)
	ovsx publish -p $(shell cat ./pat-open-vsx)
	@echo "Publishing to Open VSX Registry..."

# Publish the extension to VS Code Marketplace
publish-vsx: package
	@echo "Publishing to VS Code Marketplace..."
	test -f ./pat || (echo "Error: pat file not found" && exit 1)
	vsce publish -p $(shell cat ./pat)

# Publish the extension to Open VSX Registry
publish-ovsx: package
	@echo "Publishing to Open VSX Registry..."
	test -f ./pat-open-vsx || (echo "Error: pat-open-vsx file not found" && exit 1)
	ovsx publish -p $(shell cat ./pat-open-vsx)

# Watch mode for development
watch:
	yarn run watch

# Help target
help:
	@echo "Available targets:"
	@echo "  all      : Clean, install dependencies, build and package (default)"
	@echo "  clean    : Remove build artifacts"
	@echo "  install  : Install dependencies"
	@echo "  build    : Build the extension"
	@echo "  package  : Create VSIX package"
	@echo "  publish  : Publish to VS Code Marketplace (requires PAT env var)"
	@echo "  publish-ovsx : Publish to Open VSX Registry (requires pat-open-vsx file)"
	@echo "  watch    : Watch mode for development"
	@echo ""
	@echo "Usage:"
	@echo "  make             # Build everything"
	@echo "  make publish     # Publish to VS Code marketplace"
	@echo "  make publish-ovsx # Publish to Open VSX Registry"