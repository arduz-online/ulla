// CORE DEPENDENCIES
export * from './ecs/Engine'
export * from './ecs/Component'
export * from './ecs/Entity'
export * from './ecs/IEntity'
export * from './ecs/Task'
export * from './ecs/helpers'
export * from './ecs/Observable'
export * from './ecs/EventManager'

// ECS INITIALIZATION
import { Engine } from './ecs/Engine'
import { Entity } from './ecs/Entity'

const entity = new Entity('scene')
;(entity as any).uuid = '0'

/** @public */
const engine = new Engine(entity)

import { DisposableComponent } from './ecs/Component'
DisposableComponent.engine = engine

export { engine }
