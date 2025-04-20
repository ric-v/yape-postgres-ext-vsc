# Makefile for postgres-explorer VS Code extension

.PHONY: all clean install build package publish

# Default target
all: clean install build package

# Clean build artifacts
clean:
	rm -rf out/
	rm -rf dist/
	rm -f *.vsix

# Install dependencies
install:
	yarn install

# Build the extension
build:
	yarn run esbuild-base --sourcemap

# Package the extension into a .vsix file
package: build
	vsce package

# Publish to VS Code Marketplace (requires VSCE_PAT environment variable)
publish: package
	@if [ -z "$(VSCE_PAT)" ]; then \
		echo "Error: VSCE_PAT environment variable not set"; \
		echo "Please set it with your Visual Studio Marketplace access token"; \
		exit 1; \
	fi
	vsce publish -p $(VSCE_PAT)

# Watch for changes during development
watch:
	yarn run esbuild-watch

# Run tests (add when tests are implemented)
test:
	@echo "No tests implemented yet"

# Install development tools
dev-setup:
	npm install -g vsce
	npm install -g @vscode/vsce