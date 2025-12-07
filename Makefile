.PHONY: all clean install build package publish publish-ovsx publish-vsx git-tag

# Variables
NODE_BIN := node
NPM_BIN := npm
VSCE_CMD := npx -y @vscode/vsce
OVSX_CMD := npx -y ovsx

# Get version and name from package.json using node
EXTENSION_NAME := $(shell $(NODE_BIN) -p "require('./package.json').name")
EXTENSION_VERSION := $(shell $(NODE_BIN) -p "require('./package.json').version")
VSIX_FILE := $(EXTENSION_NAME)-$(EXTENSION_VERSION).vsix

# Default target
all: clean install build package

# Clean build artifacts
clean:
	rm -rf out dist *.vsix node_modules

# Install dependencies
install:
	$(NPM_BIN) install

# Build the extension
build:
	$(NPM_BIN) run vscode:prepublish

# Package the extension
package: build
	@echo "Temporarily moving README.md to ensure MARKETPLACE.md is used..."
	@if [ -f README.md ]; then mv README.md README.md.bak; fi
	@trap 'if [ -f README.md.bak ]; then mv README.md.bak README.md; fi' EXIT INT TERM; \
	$(VSCE_CMD) package; \
	EXIT_CODE=$$?; \
	if [ -f README.md.bak ]; then mv README.md.bak README.md; fi; \
	exit $$EXIT_CODE

# Publish the extension to VS Code Marketplace and Open VSX Registry
publish: package
	@echo "Publishing $(VSIX_FILE) to VS Code Marketplace..."
	test -f ./pat || (echo "Error: pat file not found. Please create a file named 'pat' containing your Personal Access Token." && exit 1)
	$(VSCE_CMD) publish --packagePath $(VSIX_FILE) -p $(shell cat ./pat)
	@echo "Successfully published to VS Code Marketplace."

	@echo "Publishing $(VSIX_FILE) to Open VSX Registry..."
	test -f ./pat-open-vsx || (echo "Error: pat-open-vsx file not found. Please create a file named 'pat-open-vsx' containing your Open VSX Access Token." && exit 1)
	$(OVSX_CMD) publish $(VSIX_FILE) -p $(shell cat ./pat-open-vsx)
	@echo "Successfully published to Open VSX Registry."

# Publish the extension to VS Code Marketplace only
publish-vsx: package
	@echo "Publishing $(VSIX_FILE) to VS Code Marketplace..."
	test -f ./pat || (echo "Error: pat file not found" && exit 1)
	$(VSCE_CMD) publish --packagePath $(VSIX_FILE) -p $(shell cat ./pat)

# Publish the extension to Open VSX Registry only
publish-ovsx: package
	@echo "Publishing $(VSIX_FILE) to Open VSX Registry..."
	test -f ./pat-open-vsx || (echo "Error: pat-open-vsx file not found" && exit 1)
	$(OVSX_CMD) publish $(VSIX_FILE) -p $(shell cat ./pat-open-vsx)

# Watch mode for development
watch:
	$(NPM_BIN) run watch

# Git tag and version bump (interactive)
git-tag:
	@echo "Current version: $(EXTENSION_VERSION)"
	@read -p "Enter the new version number (e.g., 1.0.1): " VERSION; \
	VERSION=$${VERSION#v}; \
	if [ -z "$$VERSION" ]; then echo "Version cannot be empty"; exit 1; fi; \
	echo "Updating package.json version to $$VERSION..."; \
	$(NODE_BIN) -e "let pkg=require('./package.json'); pkg.version='$$VERSION'; require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));"; \
	echo "package.json updated."; \
	git add package.json; \
	git commit -m "Bump version to $$VERSION"; \
	git tag -a "v$$VERSION" -m "Release v$$VERSION"; \
	git push origin main; \
	git push origin "v$$VERSION"; \
	echo "Git tag v$$VERSION created and pushed."

# Help target
help:
	@echo "Available targets:"
	@echo "  all          : Clean, install, build, and package"
	@echo "  clean        : Remove build artifacts"
	@echo "  install      : Install dependencies"
	@echo "  build        : Build the extension"
	@echo "  package      : Create VSIX package"
	@echo "  publish      : Publish to BOTH VS Code Marketplace and Open VSX"
	@echo "  publish-vsx  : Publish to VS Code Marketplace only"
	@echo "  publish-ovsx : Publish to Open VSX Registry only"
	@echo "  git-tag      : Interactive version bump, commit, tag, and push"