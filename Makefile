# General setup

.SUFFIXES:

NODE = node
TS_NODE = node_modules/.bin/ts-node
TSC = node_modules/.bin/tsc
CWD = $(shell pwd)

COMPILER_FILES = packages/ulla-compiler/bin.js
ECS_COMPILED_FILES := packages/ulla-ecs/src/index.js
ECS_CONFIG_DEPENDENCIES := packages/ulla-ecs/package.json packages/ulla-ecs/tsconfig.json
BUILD_ECS := packages/ulla-builder/index.js
DIST_PACKAGE_JSON := packages/ulla-ecs/package.json
ECS_COMPILED_FILES_DECL := packages/ulla-ecs/types/dist/index.d.ts

COMPILER_NPM_DEPENDENCIES := packages/ulla-compiler/package.json packages/ulla-compiler/tsconfig.json packages/ulla-compiler/bin.ts

SOURCE_SUPPORT_TS_FILES := $(wildcard scripts/*.ts)

packages/amd-loader/%.js: packages/amd-loader/%.ts packages/amd-loader/tsconfig.json
	@$(TSC) --build packages/amd-loader/tsconfig.json

packages/ulla-builder/index.js: packages/ulla-builder/index.ts packages/ulla-builder/tsconfig.json
	@$(TSC) --build packages/ulla-builder/tsconfig.json
	@chmod +x packages/ulla-builder/index.js

packages/ulla-ecs/src/index.js: $(DECENTRALAND_ECS_SOURCES) $(ECS_CONFIG_DEPENDENCIES) $(COMPILER_FILES)
	@$(COMPILER_FILES) build-recipes/ecs.json

packages/ulla-compiler/bin.js: $(COMPILER_NPM_DEPENDENCIES)
	@cd packages/ulla-compiler; npm i
	@$(TSC) --build packages/ulla-compiler/tsconfig.json
	@cd packages/ulla-compiler; chmod +x bin.js

packages/ulla-ecs/types/dist/index.d.ts: $(SOURCE_SUPPORT_TS_FILES) $(ECS_COMPILED_FILES) $(ECS_CONFIG_DEPENDENCIES)
	@cd packages/ulla-ecs; $(PWD)/node_modules/.bin/api-extractor run --typescript-compiler-folder "$(PWD)/node_modules/typescript" --local
	@$(TS_NODE) ./scripts/buildEcsTypes.ts
	@npx prettier --write 'packages/ulla-ecs/types/dist/index.d.ts'

example: build
	@rm -rf packages/example/node_modules
	@mkdir packages/example/node_modules || true
	@ln -sf $(CWD)/packages/ulla-ecs packages/example/node_modules/ulla-ecs
	@cd packages/example; npm test

build: $(BUILD_ECS) $(COMPILER_FILES) $(ECS_COMPILED_FILES_DECL) $(DIST_PACKAGE_JSON) ## Build all the entrypoints and run the `scripts/prepareDist` script

publish: build example ## Release a new version, using the `scripts/npmPublish` script
	@$(TS_NODE) ./scripts/prepareDist.ts
	@cd $(PWD)/packages/ulla-ecs; $(TS_NODE) $(PWD)/scripts/npmPublish.ts

.PHONY: clean

clean:
	rm -rf packages/example/node_modules
	rm -rf packages/ulla-ecs/dist
	rm -rf packages/ulla-ecs/types/dist
	rm -rf packages/ulla-ecs/temp
	rm -rf packages/ulla-ecs/types/ulla
	rm -rf packages/ulla-builder/index.js
	rm -rf packages/ulla-compiler/bin.js