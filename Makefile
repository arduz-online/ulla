# General setup

.SUFFIXES:

NODE = node
TSC = $(PWD)/node_modules/.bin/tsc
CWD = $(shell pwd)

COMPILER = packages/ulla-compiler/bin.js
ECS_COMPILED_FILES := packages/ulla-ecs/src/index.js
ECS_CONFIG_DEPENDENCIES := packages/ulla-ecs/package.json packages/ulla-ecs/tsconfig.json
BUILD_ECS := packages/ulla-builder/index.js
DIST_PACKAGE_JSON := packages/ulla-ecs/package.json
ECS_COMPILED_FILES_DECL := packages/ulla-ecs/types/dist/index.d.ts
AMD_DEP := packages/ulla-amd/dist/amd.js
AMD_EX := packages/example/ulla-ecs/artifacts/amd.js

COMPILER_NPM_DEPENDENCIES := packages/ulla-compiler/package.json packages/ulla-compiler/tsconfig.json packages/ulla-compiler/bin.ts

NPM_PUBLISH_SCRIPT := scripts/npmPublish.js
BUILD_ECS_SCRIPT := scripts/buildEcsTypes.js
DIST_SCRIPT := scripts/prepareDist.js

SOURCE_SUPPORT_TS_FILES := $(wildcard scripts/*.ts)

install:
	@npm install
	@cd packages/ulla-compiler; npm install

scripts/%.js: scripts/%.ts scripts/tsconfig.json
	@echo "> running for scripts"
	@$(TSC) --build scripts/tsconfig.json

packages/amd-loader/%.js: packages/amd-loader/%.ts packages/amd-loader/tsconfig.json
	@echo "> running for packages/amd-loader"
	@$(TSC) --build packages/amd-loader/tsconfig.json

packages/ulla-builder/index.js: packages/ulla-builder/index.ts packages/ulla-builder/tsconfig.json
	@echo "> running for packages/ulla-builder/index.js"
	@$(TSC) --build packages/ulla-builder/tsconfig.json
	@chmod +x packages/ulla-builder/index.js

clean_ulla-ecs:
	@echo "> cleaning ulla-ecs"
	@rm -rf packages/ulla-ecs/dist
	@rm -rf packages/ulla-ecs/temp
	@rm -rf packages/ulla-ecs/types/dist
	@rm -rf packages/ulla-ecs/artifacts
	@rm -rf packages/ulla-ecs/types/ulla

packages/ulla-ecs/src/index.js: clean_ulla-ecs $(ECS_CONFIG_DEPENDENCIES) $(COMPILER)
	@echo "> running for packages/ulla-ecs/src/index.js"
	@$(COMPILER) packages/ulla-ecs/build.json


packages/ulla-compiler/bin.js: $(COMPILER_NPM_DEPENDENCIES)
	@echo "> running for packages/ulla-compiler/bin.js"
	@cd packages/ulla-compiler; npm i
	@$(TSC) --build packages/ulla-compiler/tsconfig.json
	@cd packages/ulla-compiler; chmod +x bin.js

packages/ulla-ecs/types/dist/index.d.ts: $(SOURCE_SUPPORT_TS_FILES) $(ECS_COMPILED_FILES) $(ECS_CONFIG_DEPENDENCIES) $(BUILD_ECS_SCRIPT)
	@echo "> running for packages/ulla-ecs/types/dist/index.d.ts"
	@cd packages/ulla-ecs; $(PWD)/node_modules/.bin/api-extractor run --typescript-compiler-folder "$(PWD)/node_modules/typescript" --local
	@$(NODE) ./scripts/buildEcsTypes.js
	@npx prettier --write 'packages/ulla-ecs/types/ulla/index.d.ts'

packages/example/ulla-ecs/artifacts/amd.js: $(AMD_DEP)
	@mkdir packages/example/node_modules || true
	@ln -sf $(CWD)/packages/ulla-ecs packages/example/node_modules/ulla-ecs

example: build $(AMD_EX)
	@cd packages/example; npm run test
	@cd packages/example; npm run test-prod

packages/ulla-amd/dist/amd.js: packages/ulla-amd/src/amd.ts packages/ulla-builder/tsconfig.json
	@echo "> running for packages/ulla-amd/dist/amd.js"
	@cd packages/ulla-amd; $(TSC) -p tsconfig.json
	@cd packages/ulla-amd; $(PWD)/node_modules/.bin/mocha

lib: scripts/cleanupLib.js packages/ulla-ecs/tsconfig.json packages/ulla-ecs/package.json
	@cp node_modules/typescript/lib/lib.es*.d.ts packages/ulla-ecs/types/env
	@$(NODE) $(PWD)/scripts/cleanupLib.js

build: lib $(BUILD_ECS) $(AMD_DEP) $(COMPILER) $(ECS_COMPILED_FILES_DECL) $(DIST_PACKAGE_JSON) $(DIST_SCRIPT) ## Build all the entrypoints and run the `scripts/prepareDist` script
	@$(NODE) ./scripts/prepareDist.js

publish: clean build example $(NPM_PUBLISH_SCRIPT) ## Release a new version, using the `scripts/npmPublish` script
	@cd $(PWD)/packages/ulla-ecs; $(NODE) $(PWD)/scripts/npmPublish.js
	@cd $(PWD)/packages/ulla-compiler; $(NODE) $(PWD)/scripts/npmPublish.js

.PHONY: clean lib

clean: clean_ulla-ecs
	rm -rf packages/example/node_modules
	rm -rf packages/ulla-amd/dist
	rm -rf packages/ulla-builder/index.js
	rm -rf packages/ulla-compiler/bin.js