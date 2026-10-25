const ts = require('typescript');
const path = require('node:path');
/** Generate discovery schemas from the actual authoring types at bundle time.
 * Runtime validation remains authoritative for bounds and cross references. */
module.exports = function schemas() {
  const files = [
    'src/model.ts',
    'src/input/model.ts',
    'src/gameplay/model.ts',
    'src/gameplay/toolkit.ts',
    'src/physics.ts',
    'src/camera2d.ts',
    'src/rendering/config.ts',
    'src/targets/model.ts',
    'src/rpg/model.ts',
  ];
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    strictNullChecks: true,
  });
  const checker = program.getTypeChecker(),
    definitions = {},
    seen = new Map();
  const convert = (type) => {
    if (type.flags & ts.TypeFlags.Undefined) return null;
    if (type.flags & ts.TypeFlags.Null) return { type: 'null' };
    if (type.isUnion()) {
      const variants = type.types.filter((t) => !(t.flags & ts.TypeFlags.Undefined)).map(convert);
      if (variants.length === 1) return variants[0];
      if (variants.every((v) => v && 'const' in v)) {
        const values = variants.map((v) => v.const);
        if (values.every((v) => typeof v === 'boolean')) return { type: 'boolean' };
        return { enum: values };
      }
      return { anyOf: variants };
    }
    if (type.flags & ts.TypeFlags.StringLiteral) return { const: type.value };
    if (type.flags & ts.TypeFlags.NumberLiteral) return { const: type.value };
    if (type.flags & ts.TypeFlags.BooleanLiteral) return { const: type.intrinsicName === 'true' };
    if (type.flags & ts.TypeFlags.StringLike) return { type: 'string' };
    if (type.flags & ts.TypeFlags.NumberLike) return { type: 'number' };
    if (type.flags & ts.TypeFlags.BooleanLike) return { type: 'boolean' };
    if (checker.isArrayType(type))
      return { type: 'array', items: convert(checker.getTypeArguments(type)[0]) };
    if (!(type.flags & ts.TypeFlags.Object) && !type.isIntersection()) return {};
    if (seen.has(type)) return { $ref: '#/$defs/' + seen.get(type) };
    const base =
      (type.aliasSymbol?.name || type.symbol?.name || 'Object').replace(/[^A-Za-z0-9_]/g, '') ||
      'Object';
    let name = base;
    while (Object.hasOwn(definitions, name))
      name = base + '_' + (Object.keys(definitions).length + 1);
    seen.set(type, name);
    const schema = { type: 'object', properties: {}, additionalProperties: false };
    definitions[name] = schema;
    const required = [];
    for (const symbol of checker.getPropertiesOfType(type)) {
      const declaration = symbol.valueDeclaration || symbol.declarations?.[0];
      if (!declaration) continue;
      const child = convert(checker.getTypeOfSymbolAtLocation(symbol, declaration)) || {};
      const description = ts.displayPartsToString(symbol.getDocumentationComment(checker));
      schema.properties[symbol.name] = description ? { ...child, description } : child;
      if (!(symbol.flags & ts.SymbolFlags.Optional)) required.push(symbol.name);
    }
    if (required.length) schema.required = required;
    const index =
      checker.getIndexTypeOfType(type, ts.IndexKind.String) ||
      checker.getIndexTypeOfType(type, ts.IndexKind.Number);
    if (index) schema.additionalProperties = convert(index);
    return { $ref: '#/$defs/' + name };
  };
  const types = {};
  for (const file of files) {
    const source = program.getSourceFile(path.resolve(file)) || program.getSourceFile(file);
    const symbol = checker.getSymbolAtLocation(source);
    for (const member of checker.getExportsOfModule(symbol))
      if (member.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias))
        types[member.name] = convert(checker.getDeclaredTypeOfSymbol(member));
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    description:
      'Generated from editor TypeScript types. validate is authoritative for numeric bounds, IDs, budgets and cross references.',
    types,
    $defs: definitions,
  };
};
