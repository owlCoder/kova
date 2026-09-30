import ts from 'typescript';

/** Test-only AST inspection. It does not belong to the application runtime. */
export function inspectSource(text: string, filename = 'fixture.ts') {
  const file = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports: { specifier: string; typeOnly: boolean }[] = [];
  const unresolvedModuleLoads: string[] = [];
  const exportedBehavior: string[] = [];
  const executableStatements: string[] = [];
  const callableDataAliases: string[] = [];

  function exported(node: ts.Node): boolean {
    return (
      ts.canHaveModifiers(node) &&
      Boolean(ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
    );
  }

  function containsCallable(node: ts.Node): boolean {
    if (
      ts.isMethodSignature(node) ||
      ts.isCallSignatureDeclaration(node) ||
      ts.isConstructSignatureDeclaration(node) ||
      ts.isFunctionTypeNode(node) ||
      ts.isConstructorTypeNode(node)
    )
      return true;
    return Boolean(ts.forEachChild(node, (child) => containsCallable(child) || undefined));
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const individualTypes =
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((element) => element.isTypeOnly);
      imports.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: Boolean(clause?.isTypeOnly || (!clause?.name && individualTypes)),
      });
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const bindings = node.exportClause;
      const individualTypes =
        bindings &&
        ts.isNamedExports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((element) => element.isTypeOnly);
      imports.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: Boolean(node.isTypeOnly || individualTypes),
      });
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      imports.push({ specifier: node.argument.literal.text, typeOnly: true });
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (expression && ts.isStringLiteral(expression))
        imports.push({ specifier: expression.text, typeOnly: node.isTypeOnly });
      else unresolvedModuleLoads.push(node.getText(file));
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument))
        imports.push({ specifier: argument.text, typeOnly: false });
      else unresolvedModuleLoads.push(node.getText(file));
    }
    if (exported(node) && ts.isClassDeclaration(node))
      exportedBehavior.push(node.name?.text ?? '<default class>');
    if (exported(node) && ts.isInterfaceDeclaration(node) && containsCallable(node))
      exportedBehavior.push(node.name.text);
    if (exported(node) && ts.isTypeAliasDeclaration(node) && containsCallable(node))
      callableDataAliases.push(node.name.text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) &&
      !ts.isExportDeclaration(statement) &&
      !ts.isInterfaceDeclaration(statement) &&
      !ts.isTypeAliasDeclaration(statement) &&
      !ts.isEmptyStatement(statement)
    )
      executableStatements.push(statement.getText(file));
  }
  return {
    imports,
    unresolvedModuleLoads,
    exportedBehavior,
    executableStatements,
    callableDataAliases,
  };
}
