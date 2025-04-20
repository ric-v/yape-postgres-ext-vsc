.PHONY: all clean install build package publish

# Default target
all: clean install build package

# Clean build artifacts
clean:
	rm -rf out dist *.vsix

# Install dependencies
install:
	yarn install

# Build the extension
build:
	yarn run vscode:prepublish

# Package the extension
package: build
	vsce package

# Publish the extension to VS Code Marketplace
publish: package
	@echo "Publishing to VS Code Marketplace..."
	test -f ./pat || (echo "Error: pat file not found" && exit 1)
	vsce publish -p $(shell cat ./pat)

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
	@echo "  watch    : Watch mode for development"
	@echo ""
	@echo "Usage:"
	@echo "  make             # Build everything"
	@echo "  make publish PAT=<your-pat>  # Publish to marketplace"