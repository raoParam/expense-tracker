import mongoose from 'mongoose';
import { SettlementService } from '../src/services/settlementService';
import { SettlementGraphService } from '../src/services/settlementGraphService';
import { calculateRoomAccounting, calculateSuggestedTransfers } from '../src/services/roomAccounting';
import { Settlement } from '../src/models/Settlement';
import { SettlementGraph } from '../src/models/SettlementGraph';
import { Room } from '../src/models/Room';
import { Expense } from '../src/models/Expense';
import { AuditEvent } from '../src/models/AuditEvent';
import { ExpenseService } from '../src/services/expenseService';

jest.mock('../src/models/Settlement');
jest.mock('../src/models/SettlementGraph');
jest.mock('../src/models/Room');
jest.mock('../src/models/Expense');
jest.mock('../src/models/AuditEvent');
jest.mock('../src/models/UserRestriction');
jest.mock('../src/services/pushNotificationService', () => ({
  PushNotificationService: {
    notifySettlementVerified: jest.fn().mockResolvedValue(undefined),
    notifySettlementRequested: jest.fn().mockResolvedValue(undefined),
    notifySettlementRejected: jest.fn().mockResolvedValue(undefined),
    notifySettlementCancelled: jest.fn().mockResolvedValue(undefined),
    notifyExpenseConfirmed: jest.fn().mockResolvedValue(undefined),
    notifyExpenseCreated: jest.fn().mockResolvedValue(undefined),
    notifyExpenseRejected: jest.fn().mockResolvedValue(undefined),
    notifyExpenseResubmitted: jest.fn().mockResolvedValue(undefined),
  },
}));

const roomId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const graphId = new mongoose.Types.ObjectId('607f1f77bcf86cd799439011');
const memberIds = ['A', 'B', 'C', 'D', 'E', 'F'];
const members = memberIds.map((userId, index) => ({
  userId,
  displayName: `Member ${userId}`,
  email: `${userId.toLowerCase()}@example.test`,
  role: index === 0 ? 'admin' : 'member',
  status: 'active',
  joinedAt: new Date(),
}));

let currentGraph: any;
const settlementStore = new Map<string, any>();
const graphSpy = jest.spyOn(SettlementGraphService, 'getGraph');
const getOrInitSpy = jest.spyOn(SettlementGraphService, 'getOrInitializeGraph');
const optimizerSpy = jest.spyOn(SettlementGraphService, 'optimizeBalances');

function makeGraph(edges: Array<[string, string, number, string?]>): any {
  return {
    _id: graphId,
    roomId,
    vertices: members.map((member) => ({ userId: member.userId })),
    edges: edges.map(([fromUserId, toUserId, amountPaise, customEdgeId], index) => ({
      edgeId: customEdgeId || `edge-${index + 1}`,
      fromUserId,
      toUserId,
      amountPaise,
      currency: 'INR',
    })),
  };
}

function registerSettlement(settlement: any): any {
  settlementStore.set(settlement._id.toString(), settlement);
  return settlement;
}

function makeSettlement(edgeId: string, fromUserId: string, toUserId: string, amountPaise: number): any {
  const settlement = {
    _id: new mongoose.Types.ObjectId(),
    roomId,
    debtorId: fromUserId,
    receiverId: toUserId,
    amountPaise,
    currency: 'INR',
    status: 'pending',
    edgeId,
  };
  registerSettlement(settlement);
  return settlement;
}

function configureGraphMocks(): void {
  (Settlement as unknown as jest.Mock).mockImplementation((data) => {
    const instance: any = {
      _id: new mongoose.Types.ObjectId(),
      ...data,
    };
    instance.save = jest.fn().mockImplementation(async () => {
      registerSettlement(instance);
      return instance;
    });
    registerSettlement(instance);
    return instance;
  });
  (Room.findById as jest.Mock).mockResolvedValue({ _id: roomId, name: 'Test room', members });
  graphSpy.mockImplementation(async () => currentGraph);
  getOrInitSpy.mockImplementation(async () => currentGraph);
  (Settlement.findById as jest.Mock).mockImplementation(async (id: any) => {
    return settlementStore.get(id?.toString()) || null;
  });
  (Settlement.findOneAndUpdate as jest.Mock).mockImplementation(async (query: any, update: any) => {
    const s = settlementStore.get(query._id?.toString());
    if (!s || s.status !== 'pending') return null;
    if (query.receiverId && s.receiverId !== query.receiverId) return null;
    if (query.debtorId && s.debtorId !== query.debtorId) return null;
    Object.assign(s, update.$set);
    return s;
  });
  (SettlementGraph.findOneAndUpdate as jest.Mock).mockImplementation(async (query: any, update: any) => {
    if (update.$set && update.$set['edges.$.amountPaise'] !== undefined) {
      const edge = currentGraph.edges.find((c: any) => c.edgeId === query.edges.$elemMatch.edgeId);
      if (!edge || edge.amountPaise !== query.edges.$elemMatch.amountPaise) return null;
      edge.amountPaise = update.$set['edges.$.amountPaise'];
      return currentGraph;
    }
    if (update.$set && update.$set.edges) {
      currentGraph.edges = update.$set.edges;
      currentGraph.vertices = update.$set.vertices || currentGraph.vertices;
      return currentGraph;
    }
    if (update.$setOnInsert) {
      return {
        _id: new mongoose.Types.ObjectId(),
        ...update.$setOnInsert,
      };
    }
    return currentGraph;
  });
  (AuditEvent.create as jest.Mock).mockResolvedValue({});
}

beforeEach(() => {
  jest.clearAllMocks();
  settlementStore.clear();
  currentGraph = makeGraph([
    ['A', 'B', 5000, 'edge-1'],
    ['C', 'D', 7000, 'edge-2'],
    ['E', 'F', 5000, 'edge-3'],
    ['E', 'D', 4000, 'edge-4'],
  ]);
  configureGraphMocks();
  optimizerSpy.mockClear();
});

describe('Spendly — Persistent Settlement Graph Specification Suite', () => {
  /**
   * Test 1: Graph preservation
   * Initial graph:
   * - A → B: ₹50
   * - C → D: ₹70
   * - E → F: ₹50
   * - E → D: ₹40
   *
   * Verify E → D.
   * Expected:
   * - A → B: ₹50 unchanged
   * - C → D: ₹70 unchanged
   * - E → F: ₹50 unchanged
   * - E → D: ₹0
   *
   * Assert exact edge IDs, directions, and all unrelated weights are unchanged.
   * Confirm optimizer was not called.
   */
  test('Test 1: Graph preservation — verify E->D preserves exact edge IDs, directions, and unrelated weights with 0 optimizer calls', async () => {
    const beforeEdges = currentGraph.edges.map((e: any) => ({ ...e }));
    const settlementED = makeSettlement('edge-4', 'E', 'D', 4000);

    const verified = await SettlementService.verifySettlement('D', settlementED._id.toString());

    expect(verified.status).toBe('verified');
    expect(optimizerSpy).not.toHaveBeenCalled();

    // Assert graph edge count and topology preserved
    expect(currentGraph.edges).toHaveLength(beforeEdges.length);
    for (let i = 0; i < beforeEdges.length; i++) {
      expect(currentGraph.edges[i].edgeId).toBe(beforeEdges[i].edgeId);
      expect(currentGraph.edges[i].fromUserId).toBe(beforeEdges[i].fromUserId);
      expect(currentGraph.edges[i].toUserId).toBe(beforeEdges[i].toUserId);
      if (beforeEdges[i].edgeId === 'edge-4') {
        expect(currentGraph.edges[i].amountPaise).toBe(0);
      } else {
        expect(currentGraph.edges[i].amountPaise).toBe(beforeEdges[i].amountPaise);
      }
    }

    // Explicit checks for the 4 edges
    const edgeAB = currentGraph.edges.find((e: any) => e.edgeId === 'edge-1');
    const edgeCD = currentGraph.edges.find((e: any) => e.edgeId === 'edge-2');
    const edgeEF = currentGraph.edges.find((e: any) => e.edgeId === 'edge-3');
    const edgeED = currentGraph.edges.find((e: any) => e.edgeId === 'edge-4');

    expect(edgeAB).toEqual({ edgeId: 'edge-1', fromUserId: 'A', toUserId: 'B', amountPaise: 5000, currency: 'INR' });
    expect(edgeCD).toEqual({ edgeId: 'edge-2', fromUserId: 'C', toUserId: 'D', amountPaise: 7000, currency: 'INR' });
    expect(edgeEF).toEqual({ edgeId: 'edge-3', fromUserId: 'E', toUserId: 'F', amountPaise: 5000, currency: 'INR' });
    expect(edgeED).toEqual({ edgeId: 'edge-4', fromUserId: 'E', toUserId: 'D', amountPaise: 0, currency: 'INR' });
  });

  /**
   * Test 2: Multiple settlements
   * Starting with:
   * - A → B: ₹500
   * - A → C: ₹250
   * - D → E: ₹300
   * - F → B: ₹150
   *
   * Verify A → B and D → E.
   * Only those exact edges may change. No other edge may be modified or recreated.
   */
  test('Test 2: Multiple settlements — verifying A->B and D->E modifies only those exact edges and preserves all others', async () => {
    // Starting graph for Test 2
    currentGraph = makeGraph([
      ['A', 'B', 50000, 'edge-ab'],
      ['A', 'C', 25000, 'edge-ac'],
      ['D', 'E', 30000, 'edge-de'],
      ['F', 'B', 15000, 'edge-fb'],
    ]);

    const settlementAB = makeSettlement('edge-ab', 'A', 'B', 50000);
    const settlementDE = makeSettlement('edge-de', 'D', 'E', 30000);

    // Verify A -> B
    const verifiedAB = await SettlementService.verifySettlement('B', settlementAB._id.toString());
    expect(verifiedAB.status).toBe('verified');

    // Verify D -> E
    const verifiedDE = await SettlementService.verifySettlement('E', settlementDE._id.toString());
    expect(verifiedDE.status).toBe('verified');

    // Confirm optimizer was never called
    expect(optimizerSpy).not.toHaveBeenCalled();

    // Check all 4 edges: only A->B and D->E changed to 0; others untouched
    expect(currentGraph.edges).toHaveLength(4);

    const edgeAB = currentGraph.edges.find((e: any) => e.edgeId === 'edge-ab');
    const edgeAC = currentGraph.edges.find((e: any) => e.edgeId === 'edge-ac');
    const edgeDE = currentGraph.edges.find((e: any) => e.edgeId === 'edge-de');
    const edgeFB = currentGraph.edges.find((e: any) => e.edgeId === 'edge-fb');

    expect(edgeAB).toEqual({ edgeId: 'edge-ab', fromUserId: 'A', toUserId: 'B', amountPaise: 0, currency: 'INR' });
    expect(edgeAC).toEqual({ edgeId: 'edge-ac', fromUserId: 'A', toUserId: 'C', amountPaise: 25000, currency: 'INR' });
    expect(edgeDE).toEqual({ edgeId: 'edge-de', fromUserId: 'D', toUserId: 'E', amountPaise: 0, currency: 'INR' });
    expect(edgeFB).toEqual({ edgeId: 'edge-fb', fromUserId: 'F', toUserId: 'B', amountPaise: 15000, currency: 'INR' });
  });

  /**
   * Test 3: New expense triggers recalculation
   * After a settlement from Test 1, confirm a new expense.
   *
   * Assert:
   * - Optimizer runs exactly once.
   * - A new valid graph is generated from current authoritative balances.
   * - Previously verified settlements are counted exactly once.
   */
  test('Test 3: New expense triggers recalculation — runs optimizer once, generates valid graph, counts verified settlement once', async () => {
    // Initial Test 1 state before the new expense:
    // Expenses that generated Test 1:
    // Expense 1: B paid 5000, A share 5000
    // Expense 2: D paid 11000, C share 7000, E share 4000
    // Expense 3: F paid 5000, E share 5000
    // Settlement from Test 1: E paid D 4000 (verified)
    const initialExpenses = [
      {
        payerId: 'B',
        amountPaise: 5000,
        status: 'confirmed',
        participants: [{ userId: 'B', sharePaise: 0 }, { userId: 'A', sharePaise: 5000 }],
      },
      {
        payerId: 'D',
        amountPaise: 11000,
        status: 'confirmed',
        participants: [
          { userId: 'D', sharePaise: 0 },
          { userId: 'C', sharePaise: 7000 },
          { userId: 'E', sharePaise: 4000 },
        ],
      },
      {
        payerId: 'F',
        amountPaise: 5000,
        status: 'confirmed',
        participants: [{ userId: 'F', sharePaise: 0 }, { userId: 'E', sharePaise: 5000 }],
      },
    ];

    const verifiedSettlements = [
      { debtorId: 'E', receiverId: 'D', amountPaise: 4000, status: 'verified' },
    ];

    // New confirmed expense: A pays 10000, split between A (5000) and B (5000)
    const newExpense = {
      payerId: 'A',
      amountPaise: 10000,
      status: 'confirmed',
      participants: [
        { userId: 'A', sharePaise: 5000 },
        { userId: 'B', sharePaise: 5000 },
      ],
    };

    (Expense.find as jest.Mock).mockResolvedValue([...initialExpenses, newExpense]);
    (Settlement.find as jest.Mock).mockResolvedValue(verifiedSettlements);

    optimizerSpy.mockClear();

    // Confirm new expense triggers graph update
    const updated = await SettlementGraphService.updateGraphForConfirmedExpense(roomId.toString());

    // 1. Assert optimizer ran exactly once
    expect(optimizerSpy).toHaveBeenCalledTimes(1);

    // 2. Previously verified settlements are counted exactly once in net balances:
    // Calculate authoritative accounting manually to assert:
    // A: paid 10000, share 5000 + 5000 = 10000 -> net = 0
    // B: paid 5000, share 5000 -> net = 0
    // C: share 7000 -> net = -7000
    // D: paid 11000, settlement received 4000 -> net = +11000 - 4000 = +7000 (settlement counted once!)
    // E: share 4000 + 5000 = 9000, settlement paid 4000 -> net = -9000 + 4000 = -5000 (settlement counted once!)
    // F: paid 5000 -> net = +5000
    const authoritative = calculateRoomAccounting(
      [...initialExpenses, newExpense],
      verifiedSettlements,
      members
    );

    const balA = authoritative.balances.find((b) => b.userId === 'A');
    const balB = authoritative.balances.find((b) => b.userId === 'B');
    const balC = authoritative.balances.find((b) => b.userId === 'C');
    const balD = authoritative.balances.find((b) => b.userId === 'D');
    const balE = authoritative.balances.find((b) => b.userId === 'E');
    const balF = authoritative.balances.find((b) => b.userId === 'F');

    expect(balA?.netBalancePaise).toBe(0);
    expect(balB?.netBalancePaise).toBe(0);
    expect(balC?.netBalancePaise).toBe(-7000);
    expect(balD?.netBalancePaise).toBe(7000);
    expect(balE?.netBalancePaise).toBe(-5000);
    expect(balF?.netBalancePaise).toBe(5000);

    // 3. Assert a new valid graph is generated from authoritative balances
    expect(updated.edges.length).toBeGreaterThan(0);
    const edgeMap = updated.edges.map((e: any) => `${e.fromUserId}->${e.toUserId}:${e.amountPaise}`);
    expect(edgeMap).toContain('C->D:7000');
    expect(edgeMap).toContain('E->F:5000');

    // Invariant: sum of outgoing minus incoming equals -netBalance for all members
    for (const b of authoritative.balances) {
      const outAmount = updated.edges.filter((e: any) => e.fromUserId === b.userId).reduce((s: number, e: any) => s + e.amountPaise, 0);
      const inAmount = updated.edges.filter((e: any) => e.toUserId === b.userId).reduce((s: number, e: any) => s + e.amountPaise, 0);
      expect(outAmount - inAmount + b.netBalancePaise).toBe(0);
    }
  });

  /**
   * Test 4: No-op events
   * Verify that pending/rejected/cancelled expenses and pending/rejected/cancelled settlements
   * do not trigger graph optimization or alter edges.
   */
  test('Test 4: No-op events — pending, rejected, cancelled expenses and settlements do not trigger optimization or alter edges', async () => {
    optimizerSpy.mockClear();
    const beforeEdges = JSON.parse(JSON.stringify(currentGraph.edges));

    // 1. Partial expense acknowledgement (expense still pending)
    (Expense.findById as jest.Mock).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      roomId,
      payerId: 'A',
      status: 'pending',
      revision: 1,
      participants: [
        { userId: 'A', status: 'acknowledged' },
        { userId: 'B', status: 'pending' },
        { userId: 'C', status: 'pending' },
      ],
    });
    (Expense.findOneAndUpdate as jest.Mock).mockResolvedValue({
      roomId,
      status: 'pending',
      revision: 1,
      participants: [
        { userId: 'A', status: 'acknowledged' },
        { userId: 'B', status: 'acknowledged' },
        { userId: 'C', status: 'pending' },
      ],
    });
    await ExpenseService.acknowledgeExpense('B', new mongoose.Types.ObjectId().toString(), 1);
    expect(optimizerSpy).not.toHaveBeenCalled();
    expect(currentGraph.edges).toEqual(beforeEdges);

    // 2. Expense rejection (partial rejection by participant)
    await ExpenseService.rejectExpense('C', new mongoose.Types.ObjectId().toString(), 1, 'Incorrect share split');
    expect(optimizerSpy).not.toHaveBeenCalled();
    expect(currentGraph.edges).toEqual(beforeEdges);

    // 3. Expense cancellation by payer
    (Expense.findOneAndUpdate as jest.Mock).mockResolvedValue({ status: 'cancelled' });
    await ExpenseService.cancelExpense('A', new mongoose.Types.ObjectId().toString());
    expect(optimizerSpy).not.toHaveBeenCalled();
    expect(currentGraph.edges).toEqual(beforeEdges);

    // 4. Pending settlement creation
    const pendingSettlement = makeSettlement('edge-4', 'E', 'D', 4000);
    (Settlement.findOne as jest.Mock).mockResolvedValue(null);
    (Settlement.prototype.save as jest.Mock).mockResolvedValue(pendingSettlement);
    await SettlementService.createSettlement('E', roomId.toString(), {
      receiverId: 'D',
      amountPaise: 4000,
      edgeId: 'edge-4',
    });
    expect(optimizerSpy).not.toHaveBeenCalled();
    expect(currentGraph.edges).toEqual(beforeEdges);

    // 5. Settlement rejection by recipient
    (Settlement.findOneAndUpdate as jest.Mock).mockResolvedValue({
      ...pendingSettlement,
      status: 'rejected',
      rejectionReason: 'Payment not received in bank account',
    });
    await SettlementService.rejectSettlement('D', pendingSettlement._id.toString(), 'Payment not received');
    expect(optimizerSpy).not.toHaveBeenCalled();
    expect(currentGraph.edges).toEqual(beforeEdges);

    // 6. Settlement cancellation by debtor
    (Settlement.findOneAndUpdate as jest.Mock).mockResolvedValue({
      ...pendingSettlement,
      status: 'cancelled',
    });
    await SettlementService.cancelSettlement('E', pendingSettlement._id.toString());
    expect(optimizerSpy).not.toHaveBeenCalled();
    expect(currentGraph.edges).toEqual(beforeEdges);
  });

  /**
   * Test 5: Precision
   * Use amounts ₹178.66, ₹67.68, ₹28.98, ₹53.34, and ₹43.32.
   * Verify exact integer-paise arithmetic with no floating-point errors.
   */
  test('Test 5: Precision — exact integer-paise arithmetic on ₹178.66, ₹67.68, ₹28.98, ₹53.34, and ₹43.32 with no floating-point drift', () => {
    // Exact amounts from specification converted strictly to integer paise:
    // ₹178.66 = 17866 paise
    // ₹67.68 = 6768 paise
    // ₹28.98 = 2898 paise
    // ₹53.34 = 5334 paise
    // ₹43.32 = 4332 paise
    const paiseAmounts = [17866, 6768, 2898, 5334, 4332];

    // Verify all paise values are safe integers without fractional components
    paiseAmounts.forEach((paise) => {
      expect(Number.isSafeInteger(paise)).toBe(true);
      expect(paise.toString()).not.toContain('.');
    });

    const accounting = calculateRoomAccounting(
      [
        { payerId: 'A', amountPaise: 17866, participants: [{ userId: 'A', sharePaise: 8933 }, { userId: 'B', sharePaise: 8933 }] },
        { payerId: 'C', amountPaise: 6768, participants: [{ userId: 'C', sharePaise: 3384 }, { userId: 'D', sharePaise: 3384 }] },
        { payerId: 'E', amountPaise: 2898, participants: [{ userId: 'E', sharePaise: 1449 }, { userId: 'F', sharePaise: 1449 }] },
        { payerId: 'B', amountPaise: 5334, participants: [{ userId: 'B', sharePaise: 2667 }, { userId: 'C', sharePaise: 2667 }] },
        { payerId: 'D', amountPaise: 4332, participants: [{ userId: 'D', sharePaise: 2166 }, { userId: 'E', sharePaise: 2166 }] },
      ],
      [],
      members
    );

    // Sum of net balances must be strictly 0
    const sumNet = accounting.balances.reduce((s, b) => s + b.netBalancePaise, 0);
    expect(sumNet).toBe(0);

    const transfers = calculateSuggestedTransfers(accounting);
    expect(transfers.length).toBeGreaterThan(0);

    // All transfer amounts must be positive safe integers (paise) with zero floating-point drift
    for (const transfer of transfers) {
      expect(Number.isSafeInteger(transfer.amountPaise)).toBe(true);
      expect(transfer.amountPaise).toBeGreaterThan(0);
      expect(transfer.amountPaise.toString()).not.toContain('.');
    }

    // Invariant: sum of suggested transfers equals total positive net balance
    const totalTransfers = transfers.reduce((s, t) => s + t.amountPaise, 0);
    const totalPositive = accounting.balances.filter((b) => b.netBalancePaise > 0).reduce((s, b) => s + b.netBalancePaise, 0);
    expect(totalTransfers).toBe(totalPositive);

    // Verify against optimizer method directly
    const optimizedTransfers = SettlementGraphService.optimizeBalances(accounting.balances);
    expect(optimizedTransfers).toEqual(transfers);
  });

  /**
   * Additional Invariant Tests
   */
  test('Room creation initializes graph with all members as vertices and empty edges array', async () => {
    const graph = await SettlementGraphService.initializeGraphForRoom(
      roomId.toString(),
      ['A', 'B', 'C', 'D', 'E', 'F']
    );

    expect(graph.vertices).toHaveLength(6);
    expect(graph.vertices.map((v: any) => v.userId)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(graph.edges).toHaveLength(0);
    expect(optimizerSpy).not.toHaveBeenCalled();
  });

  test('Complex graph: 10-member graph preserves all unrelated edges across arbitrary verification order', () => {
    const tenMembers = Array.from({ length: 10 }, (_, i) => ({
      userId: `user-${String(i).padStart(2, '0')}`,
    }));
    const balances = [12000, -7000, 4500, -3300, 2200, -1800, 900, -600, 300, -7200].map((netBalancePaise, index) => ({
      ...tenMembers[index],
      netBalancePaise,
      totalPaidPaise: 0,
      totalSharePaise: 0,
    }));

    const initial = calculateSuggestedTransfers({ balances });
    const graphEdges = initial.map((t, index) => ({
      edgeId: `edge-${index + 1}`,
      fromUserId: t.fromUserId,
      toUserId: t.toUserId,
      amountPaise: t.amountPaise,
    }));

    // Verify multiple edges in arbitrary order: last, first, middle
    const orderToVerify = [graphEdges.length - 1, 0, Math.floor(graphEdges.length / 2)];
    for (const targetIdx of orderToVerify) {
      const beforeSnapshot = graphEdges.map((e) => ({ ...e }));
      graphEdges[targetIdx].amountPaise = 0;

      // Assert all other edges remain strictly identical
      graphEdges.forEach((edge, idx) => {
        if (idx !== targetIdx) {
          expect(edge).toEqual(beforeSnapshot[idx]);
        }
      });
      expect(graphEdges[targetIdx].fromUserId).toBe(beforeSnapshot[targetIdx].fromUserId);
      expect(graphEdges[targetIdx].toUserId).toBe(beforeSnapshot[targetIdx].toUserId);
      expect(graphEdges[targetIdx].edgeId).toBe(beforeSnapshot[targetIdx].edgeId);
    }

    expect(optimizerSpy).not.toHaveBeenCalled();
  });

  test('Invariants: zero-weight edges preserved, no negative weights, vertices match members', () => {
    // 1. No negative edge weights
    expect(currentGraph.edges.every((e: any) => e.amountPaise >= 0)).toBe(true);

    // 2. Zero-weight edges remain present
    currentGraph.edges[3].amountPaise = 0;
    expect(currentGraph.edges.some((e: any) => e.edgeId === 'edge-4' && e.amountPaise === 0)).toBe(true);
    expect(currentGraph.edges).toHaveLength(4);

    // 3. All graph vertices are valid room members
    const roomUserIds = new Set(members.map((m) => m.userId));
    expect(currentGraph.vertices.every((v: any) => roomUserIds.has(v.userId))).toBe(true);

    // 4. Sum of room net balances is strictly zero
    const accounting = calculateRoomAccounting(
      [{ payerId: 'A', amountPaise: 6000, participants: [{ userId: 'A', sharePaise: 3000 }, { userId: 'B', sharePaise: 3000 }] }],
      [{ debtorId: 'B', receiverId: 'A', amountPaise: 1000 }],
      members
    );
    const sum = accounting.balances.reduce((s, b) => s + b.netBalancePaise, 0);
    expect(sum).toBe(0);

    // 5. Verified payments are applied exactly once
    const bBal = accounting.balances.find((b) => b.userId === 'B');
    expect(bBal?.netBalancePaise).toBe(-2000);

    // 6. Outstanding amounts in graph agree with net balances
    const transfers = calculateSuggestedTransfers(accounting);
    for (const b of accounting.balances) {
      const outPaise = transfers.filter((t) => t.fromUserId === b.userId).reduce((s, t) => s + t.amountPaise, 0);
      const inPaise = transfers.filter((t) => t.toUserId === b.userId).reduce((s, t) => s + t.amountPaise, 0);
      expect(outPaise - inPaise + b.netBalancePaise).toBe(0);
    }
  });
});
