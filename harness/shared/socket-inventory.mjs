import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {REFERENCE} from './reference.mjs';

// Source declarations only: this never starts a socket server or notification receiver.
export function inventorySocketContracts({referenceRoot, namespace, ts}) {
  const git = (...args) => execFileSync('git', args, {cwd: referenceRoot, timeout: 10000});
  const sources = new Map();
  function load(path) {
    if (sources.has(path)) return sources.get(path);
    const bytes = git('show', `${REFERENCE.commit}:${path}`);
    const ast = ts.createSourceFile(path, bytes.toString('utf8'), ts.ScriptTarget.Latest, true);
    const pin = {path, bytes: bytes.length, gitBlob: git('rev-parse', `${REFERENCE.commit}:${path}`).toString().trim(),
      sha256: createHash('sha256').update(bytes).digest('hex'), url: `${REFERENCE.repository}/blob/${REFERENCE.commit}/${path}`};
    const source = {ast, pin, location: node => ({...pin,
      line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
      endLine: ast.getLineAndCharacterOfPosition(node.getEnd()).line + 1})};
    sources.set(path, source);
    return source;
  }
  function all(root, predicate) {
    const result = [];
    function visit(node) {if (predicate(node)) result.push(node); ts.forEachChild(node, visit);}
    visit(root); return result;
  }
  function one(nodes, label) {assert.equal(nodes.length, 1, label); return nodes[0];}
  function literal(node) {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
      assert(ts.isPropertyAssignment(property)); return [property.name.getText().replace(/^['"]|['"]$/g, ''), literal(property.initializer)];
    }));
    throw new Error(`Unresolved socket declaration literal: ${node.getText()}`);
  }
  function ancestorsInThen(node) {
    const result = [];
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isIfStatement(parent) && parent.thenStatement.pos <= node.pos && parent.thenStatement.end >= node.end)
        result.push(parent);
    }
    return result;
  }
  const index = load(`src/api/namespaces/${namespace}/index.ts`);
  const socketMethod = one(all(index.ast, n => ts.isMethodDeclaration(n) && n.name.getText(index.ast) === 'socket'), 'namespace socket method');
  const calls = all(socketMethod, n => ts.isCallExpression(n) &&
    (n.expression.getText(index.ast).endsWith('.sockets') || /^(salesSockets|auctionSockets|buyofferSockets|templateBuyofferSockets)$/.test(n.expression.getText(index.ast))));
  const defaults = one(all(index.ast, n => ts.isIfStatement(n) && n.expression.getText(index.ast) === '!this.args.socket_features'), 'whole socket_features default');
  const assignment = one(all(defaults.thenStatement, n => ts.isBinaryExpression(n) && n.left.getText(index.ast) === 'this.args.socket_features'), 'socket defaults assignment');
  const routePaths = git('ls-tree', '-r', '--name-only', REFERENCE.commit, '--', `src/api/namespaces/${namespace}/routes`).toString().trim().split('\n')
    .filter(path => path.endsWith('.ts') && !path.endsWith('.test.ts'));
  const registrations = [];
  for (const path of routePaths) {
    const text = git('show', `${REFERENCE.commit}:${path}`).toString();
    if (!text.includes('createSocketApiNamespace(')) continue;
    const source = load(path), {ast, location} = source;
    for (const create of all(ast, n => ts.isCallExpression(n) && n.expression.getText(ast) === 'createSocketApiNamespace')) {
      let owner = create.parent;
      while (owner && !ts.isMethodDeclaration(owner) && !ts.isFunctionDeclaration(owner)) owner = owner.parent;
      assert(owner?.body, 'Socket creation has an enclosing declared function');
      const ownerName = ts.isMethodDeclaration(owner) ? `${owner.parent.name.text}.${owner.name.getText(ast)}` : owner.name.text;
      const registrationCall = one(calls.filter(call => {
        if (ts.isFunctionDeclaration(owner)) return call.expression.getText(index.ast) === ownerName;
        const receiver = call.expression.expression.getText(index.ast);
        return all(socketMethod, n => ts.isVariableDeclaration(n) && n.name.getText(index.ast) === receiver
          && n.initializer && ts.isNewExpression(n.initializer) && n.initializer.expression.getText(index.ast) === owner.parent.name.text).length === 1;
      }), 'Namespace registration for ' + ownerName);
      const suffix = create.arguments[1];
      assert(ts.isBinaryExpression(suffix) && ts.isStringLiteralLike(suffix.right));
      const onData = one(all(owner.body, n => ts.isCallExpression(n) && n.expression.getText(ast) === 'notification.onData'), 'onData channel');
      const filter = one(all(owner.body, n => ts.isIfStatement(n) && /^trace\.act\.account !== /.test(n.expression.getText(ast))), 'configured contract filter');
      assert(ts.isBinaryExpression(filter.expression));
      const subscriptions = all(owner.body, n => ts.isCallExpression(n) && n.expression.getText(ast) === 'socket.on').map(call => {
        const callback = call.arguments[1];
        const rooms = one(all(callback, n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'availableRooms'), 'subscription room declaration');
        const join = one(all(callback, n => ts.isCallExpression(n) && n.expression.getText(ast) === 'socket.join'), 'room join');
        const leave = one(all(callback, n => ts.isCallExpression(n) && n.expression.getText(ast) === 'socket.leave'), 'room leave');
        return {event: literal(call.arguments[0]), rooms: literal(rooms.initializer), source: location(call), roomsSource: location(rooms),
          joinWhen: ancestorsInThen(join)[0].expression.getText(ast), joinSource: location(join),
          leaveWhen: ancestorsInThen(leave)[0].expression.getText(ast), leaveSource: location(leave),
          separateUnsubscribe: false, semantics: 'For each available room, truthy data[room] joins; otherwise an existing membership leaves. No separate unsubscribe listener is declared.'};
      });
      const emissions = all(owner.body, n => ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && n.expression.name.text === 'emit' && n.expression.expression.getText(ast).startsWith('namespace'));
      const events = [], forks = [];
      for (const emit of emissions) {
        const target = emit.expression.expression;
        const conditions = ancestorsInThen(emit);
        const action = conditions.find(n => /^trace\.act\.name === /.test(n.expression.getText(ast)));
        const fork = conditions.find(n => n.expression.getText(ast) === "notification.type === 'fork'");
        const payload = emit.arguments[1]; assert(ts.isObjectLiteralExpression(payload));
        const event = {event: literal(emit.arguments[0]), room: ts.isCallExpression(target) ? literal(target.arguments[0]) : null,
          payload: payload.getText(ast), payloadFields: payload.properties.map(p => p.name.getText(ast)), source: location(emit)};
        if (action) events.push({...event, trigger: {action: literal(action.expression.right), source: location(action)},
          featureGates: conditions.filter(n => n.expression.getText(ast).includes('socket_features')).map(n => ({expression: n.expression.getText(ast), source: location(n)}))});
        else {assert(fork, 'Every emitted event has a source action or fork trigger'); forks.push({...event, trigger: {notificationType: 'fork', source: location(fork)}});}
      }
      registrations.push({path: `/${namespace}${suffix.right.text}`, function: ownerName,
        source: location(create), registrationSource: index.location(registrationCall),
        notification: {channel: literal(onData.arguments[0]), source: location(onData)},
        accountFilter: {expression: filter.expression.getText(ast), expectedAccount: filter.expression.right.getText(ast), source: location(filter)},
        subscriptions, events, fork: one(forks, 'namespace-wide fork emission'),
        implementationStatus: 'not_implemented', referenceBehaviorStatus: 'source_inventory_only'});
    }
  }
  assert.equal(registrations.length, calls.length, 'Every namespace registration is retained, including duplicate paths');
  registrations.sort((a,b) => a.registrationSource.line - b.registrationSource.line);
  const utility = load('src/api/utils.ts');
  const factory = one(all(utility.ast, n => ts.isFunctionDeclaration(n) && n.name?.text === 'createSocketApiNamespace'), 'namespace factory');
  const factoryCall = one(all(factory, n => ts.isCallExpression(n) && n.expression.getText(utility.ast) === 'server.socket.io.of'), 'io.of factory call');
  const server = load('src/api/server.ts');
  const socketServer = one(all(server.ast, n => ts.isClassDeclaration(n) && n.name?.text === 'SocketServer'), 'SocketServer class');
  const construction = one(all(socketServer, n => ts.isNewExpression(n) && n.expression.getText(server.ast) === 'Server'), 'Socket.IO construction');
  return {status: 'source declarations inventoried; reference socket sessions and Hyperion streaming integration pending', runtimeQualified: false,
    registrationCount: registrations.length, distinctNamespaceCount: new Set(registrations.map(r => r.path)).size, registrations,
    featureDefaults: {condition: defaults.expression.getText(index.ast), value: literal(assignment.right), source: index.location(defaults),
      semantics: 'Defaults replace the whole falsy socket_features value; an existing object is not merged with per-key defaults.'},
    namespaceFactory: {expression: factoryCall.getText(utility.ast), source: utility.location(factory)},
    transport: {options: literal(construction.arguments[1]), source: server.location(construction)},
    sourcePins: [...sources.values()].map(s => s.pin).sort((a,b) => a.path.localeCompare(b.path))};
}
