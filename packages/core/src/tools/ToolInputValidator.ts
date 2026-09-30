import type { JsonObject, JsonValue } from '../common/JsonValue.js';
import type { ToolCall } from './ToolCall.js';
import type { ToolCallCandidate } from './ToolCallCandidate.js';
import type { ToolDefinition } from './ToolDefinition.js';

/** Concrete schema policy; IO adapters and the orchestration loop use the same checks. */
export class ToolInputValidator {
  validate(
    candidate: ToolCallCandidate,
    definition: ToolDefinition,
  ):
    | { readonly valid: true; readonly call: ToolCall }
    | { readonly valid: false; readonly code: string; readonly message: string } {
    let argumentsValue = candidate.arguments;
    if (typeof argumentsValue === 'string') {
      try {
        argumentsValue = JSON.parse(argumentsValue) as JsonValue;
      } catch {
        return {
          valid: false,
          code: 'InvalidArguments',
          message: 'Tool arguments must be valid JSON',
        };
      }
    }
    if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue))
      return {
        valid: false,
        code: 'InvalidArguments',
        message: 'Tool arguments must be a JSON object',
      };
    const issue = this.issue(
      argumentsValue,
      definition.inputSchema,
      definition.inputSchema,
      'arguments',
      0,
    );
    return issue
      ? { valid: false, code: 'InvalidArguments', message: issue }
      : {
          valid: true,
          call: { id: candidate.id, name: candidate.name, arguments: argumentsValue as JsonObject },
        };
  }
  private issue(
    value: JsonValue,
    schema: JsonValue,
    root: JsonObject,
    path: string,
    depth: number,
  ): string | null {
    if (depth > 64) return `${path} exceeds schema nesting limit`;
    if (schema === false) return `${path} is not allowed`;
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null;
    const spec = schema as JsonObject;
    if (typeof spec.$ref === 'string') {
      if (!spec.$ref.startsWith('#/'))
        return `${path} uses an unsupported external schema reference`;
      let target: JsonValue = root;
      for (const part of spec.$ref
        .slice(2)
        .split('/')
        .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))) {
        if (!target || typeof target !== 'object' || Array.isArray(target))
          return `${path} has an invalid schema reference`;
        target = (target as JsonObject)[part] ?? null;
      }
      return this.issue(value, target, root, path, depth + 1);
    }
    for (const combinator of ['anyOf', 'oneOf', 'allOf'] as const) {
      const variants = spec[combinator];
      if (Array.isArray(variants)) {
        const matches = variants.filter(
          (variant) => this.issue(value, variant, root, path, depth + 1) === null,
        ).length;
        if (
          combinator === 'allOf'
            ? matches !== variants.length
            : combinator === 'oneOf'
              ? matches !== 1
              : matches < 1
        )
          return `${path} does not match ${combinator} schema`;
      }
    }
    const types = Array.isArray(spec.type)
      ? spec.type
      : typeof spec.type === 'string'
        ? [spec.type]
        : [];
    const typeMatches = (type: JsonValue) =>
      type === 'null'
        ? value === null
        : type === 'array'
          ? Array.isArray(value)
          : type === 'object'
            ? value !== null && typeof value === 'object' && !Array.isArray(value)
            : type === 'integer'
              ? typeof value === 'number' && Number.isInteger(value)
              : type === 'number'
                ? typeof value === 'number' && Number.isFinite(value)
                : typeof value === type;
    if (types.length && !types.some(typeMatches)) return `${path} has an invalid type`;
    if (
      Array.isArray(spec.enum) &&
      !spec.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))
    )
      return `${path} is not an allowed value`;
    if (typeof value === 'number') {
      if (
        !Number.isFinite(value) ||
        (typeof spec.minimum === 'number' && value < spec.minimum) ||
        (typeof spec.maximum === 'number' && value > spec.maximum)
      )
        return `${path} is outside the allowed numeric range`;
    }
    if (typeof value === 'string') {
      if (
        (typeof spec.minLength === 'number' && value.length < spec.minLength) ||
        (typeof spec.maxLength === 'number' && value.length > spec.maxLength)
      )
        return `${path} is outside the allowed string length`;
    }
    if (Array.isArray(value)) {
      if (
        (typeof spec.minItems === 'number' && value.length < spec.minItems) ||
        (typeof spec.maxItems === 'number' && value.length > spec.maxItems)
      )
        return `${path} has an invalid item count`;
      if (spec.items !== undefined)
        for (let index = 0; index < value.length; index++) {
          const error = this.issue(
            value[index] ?? null,
            spec.items,
            root,
            `${path}[${index}]`,
            depth + 1,
          );
          if (error) return error;
        }
    } else if (value && typeof value === 'object') {
      const properties =
        spec.properties && typeof spec.properties === 'object' && !Array.isArray(spec.properties)
          ? (spec.properties as JsonObject)
          : {};
      if (Array.isArray(spec.required))
        for (const key of spec.required)
          if (typeof key === 'string' && !Object.hasOwn(value, key))
            return `${path}.${key} is required`;
      for (const [key, entry] of Object.entries(value)) {
        const known = Object.hasOwn(properties, key);
        if (!known && spec.additionalProperties === false) return `${path}.${key} is not allowed`;
        const child = known ? (properties[key] ?? true) : (spec.additionalProperties ?? true);
        const error = this.issue(entry, child, root, `${path}.${key}`, depth + 1);
        if (error) return error;
      }
    }
    return null;
  }
}
