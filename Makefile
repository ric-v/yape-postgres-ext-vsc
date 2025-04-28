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
publish: package git-tag
	@echo "Publishing to VS Code Marketplace..."
	test -f ./pat || (echo "Error: pat file not found" && exit 1)
	vsce publish -p $(shell cat ./pat)
	@echo "Publishing to VS Code Marketplace..."

	@echo "Publishing to Open VSX Registry..."
	test -f ./pat-open-vsx || (echo "Error: pat-open-vsx file not found" && exit 1)
	ovsx publish -p $(shell cat ./pat-open-vsx)
	@echo "Publishing to Open VSX Registry..."

# Publish the extension to VS Code Marketplace
publish-vsx: package git-tag
	@echo "Publishing to VS Code Marketplace..."
	test -f ./pat || (echo "Error: pat file not found" && exit 1)
	vsce publish -p $(shell cat ./pat)

# Publish the extension to Open VSX Registry
publish-ovsx: package git-tag
	@echo "Publishing to Open VSX Registry..."
	test -f ./pat-open-vsx || (echo "Error: pat-open-vsx file not found" && exit 1)
	ovsx publish -p $(shell cat ./pat-open-vsx)

# Watch mode for development
watch:
	yarn run watch

git-tag:
	@echo "Creating a new git tag..."
	@read -p "Enter the version number (e.g., 1.0.0): " VERSION && \
	VERSION=$${VERSION#v} && \
	git tag -a "v$$VERSION" -m "Release v$$VERSION" && \
	git push origin "v$$VERSION" && \
	echo "Git tag v$$VERSION created and pushed." && \
	echo "Updating package.json version to $$VERSION..." && \
	jq --arg version "$$VERSION" '.version = $$version' package.json > tmp.json && mv tmp.json package.json && \
	echo "package.json version updated to $$VERSION."

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