import {
  type Scenario, type InsertScenario,
  type Run, type InsertRun,
  type SafetyCheck, type InsertSafetyCheck,
  type Lesson, type InsertLesson,
  type Review, type InsertReview,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Scenarios
  getScenarios(): Promise<Scenario[]>;
  getScenario(id: string): Promise<Scenario | undefined>;
  createScenario(s: InsertScenario): Promise<Scenario>;

  // Runs
  getRuns(): Promise<Run[]>;
  getRun(id: string): Promise<Run | undefined>;
  createRun(r: InsertRun): Promise<Run>;
  updateRun(id: string, data: Partial<InsertRun>): Promise<Run | undefined>;

  // Safety Checks
  getSafetyChecks(): Promise<SafetyCheck[]>;
  getSafetyCheck(id: string): Promise<SafetyCheck | undefined>;
  createSafetyCheck(sc: InsertSafetyCheck): Promise<SafetyCheck>;

  // Lessons
  getLessons(): Promise<Lesson[]>;
  getLesson(id: string): Promise<Lesson | undefined>;
  createLesson(l: InsertLesson): Promise<Lesson>;

  // Reviews
  getReviews(): Promise<Review[]>;
  getReview(id: string): Promise<Review | undefined>;
  createReview(r: InsertReview): Promise<Review>;
}

export class MemStorage implements IStorage {
  private scenarios: Map<string, Scenario> = new Map();
  private runs: Map<string, Run> = new Map();
  private safetyChecks: Map<string, SafetyCheck> = new Map();
  private lessons: Map<string, Lesson> = new Map();
  private reviews: Map<string, Review> = new Map();

  constructor() {
    this.seed();
  }

  // ── Scenarios ──
  async getScenarios() { return Array.from(this.scenarios.values()); }
  async getScenario(id: string) { return this.scenarios.get(id); }
  async createScenario(s: InsertScenario): Promise<Scenario> {
    const id = randomUUID();
    const scenario: Scenario = { ...s, id };
    this.scenarios.set(id, scenario);
    return scenario;
  }

  // ── Runs ──
  async getRuns() { return Array.from(this.runs.values()); }
  async getRun(id: string) { return this.runs.get(id); }
  async createRun(r: InsertRun): Promise<Run> {
    const id = randomUUID();
    const run: Run = {
      ...r,
      id,
      operatorNote: r.operatorNote ?? null,
      evidence: r.evidence ?? null,
      safetyDecision: r.safetyDecision ?? null,
    };
    this.runs.set(id, run);
    return run;
  }
  async updateRun(id: string, data: Partial<InsertRun>): Promise<Run | undefined> {
    const run = this.runs.get(id);
    if (!run) return undefined;
    const updated = { ...run, ...data, updatedAt: new Date().toISOString() };
    this.runs.set(id, updated);
    return updated;
  }

  // ── Safety Checks ──
  async getSafetyChecks() { return Array.from(this.safetyChecks.values()); }
  async getSafetyCheck(id: string) { return this.safetyChecks.get(id); }
  async createSafetyCheck(sc: InsertSafetyCheck): Promise<SafetyCheck> {
    const id = randomUUID();
    const check: SafetyCheck = {
      ...sc,
      id,
      runId: sc.runId ?? null,
    };
    this.safetyChecks.set(id, check);
    return check;
  }

  // ── Lessons ──
  async getLessons() { return Array.from(this.lessons.values()); }
  async getLesson(id: string) { return this.lessons.get(id); }
  async createLesson(l: InsertLesson): Promise<Lesson> {
    const id = randomUUID();
    const lesson: Lesson = {
      ...l,
      id,
      taxonomyL2: l.taxonomyL2 ?? null,
    };
    this.lessons.set(id, lesson);
    return lesson;
  }

  // ── Reviews ──
  async getReviews() { return Array.from(this.reviews.values()); }
  async getReview(id: string) { return this.reviews.get(id); }
  async createReview(r: InsertReview): Promise<Review> {
    const id = randomUUID();
    const review: Review = {
      ...r,
      id,
      runId: r.runId ?? null,
    };
    this.reviews.set(id, review);
    return review;
  }

  // ── Seed ──
  private seed() {
    // --- 8 Scenarios ---
    const scenarioData: (InsertScenario & { id: string })[] = [
      {
        id: "sc-001",
        title: "Next.js Prisma Schema Drift",
        category: "software-engineering",
        difficulty: "medium",
        description: "Prisma schema berubah di branch dev tapi migration belum dijalankan di staging. App crash saat query model baru.",
        objective: "Identifikasi drift antara schema Prisma dan database aktual, lalu sinkronisasi dengan aman.",
        acceptanceCriteria: "Migration berjalan tanpa data loss, app bisa query model baru, smoke test lulus.",
        safeSteps: "1. Bandingkan schema.prisma vs database introspect\n2. Buat migration draft\n3. Review SQL yang dihasilkan\n4. Jalankan di sandbox dulu\n5. Verifikasi dengan query test",
        antiPatterns: "Langsung db push ke staging tanpa review SQL. Menghapus kolom tanpa backup. Mengabaikan foreign key constraint.",
        verificationChecklist: "prisma migrate status clean, query model baru berhasil, zero data loss",
        targetEvidence: "Output prisma migrate status, log query berhasil, screenshot app running",
        primaryRisk: "Data loss jika migration salah urut atau ada breaking change",
        readiness: "ready",
      },
      {
        id: "sc-002",
        title: "IPv6 DNS Resolution Failure",
        category: "network",
        difficulty: "hard",
        description: "VPS resolve hostname database hanya ke IPv6 tapi jalur IPv6 tidak tersedia, menyebabkan koneksi gagal.",
        objective: "Diagnosis dan perbaiki resolusi DNS agar koneksi database berhasil dari VPS.",
        acceptanceCriteria: "Koneksi database berhasil via IPv4, fallback mechanism terdokumentasi.",
        safeSteps: "1. Cek DNS resolution (dig AAAA vs A)\n2. Tes konektivitas TCP per AF\n3. Konfigurasi preferensi IPv4\n4. Verifikasi koneksi database\n5. Dokumentasi perubahan",
        antiPatterns: "Menyalahkan firewall tanpa cek DNS dulu. Whitelist IP internal. Mengubah konfigurasi jaringan global.",
        verificationChecklist: "DNS resolve ke IPv4, TCP connect berhasil, database query OK",
        targetEvidence: "dig output, telnet/nc test, psql connection log",
        primaryRisk: "Salah diagnosis bisa menyebabkan perubahan firewall yang tidak perlu",
        readiness: "ready",
      },
      {
        id: "sc-003",
        title: "Environment Variable Mismatch",
        category: "config",
        difficulty: "easy",
        description: "Env file di local berbeda dengan production, menyebabkan fitur payment gateway tidak aktif.",
        objective: "Audit dan sinkronkan environment variables antara local, staging, dan production.",
        acceptanceCriteria: "Semua env yang diperlukan tersedia di setiap environment, tidak ada secret yang terekspos.",
        safeSteps: "1. List semua env yang dipakai app\n2. Bandingkan per environment\n3. Identifikasi yang missing\n4. Tambahkan dengan value yang benar\n5. Restart service & test",
        antiPatterns: "Copy-paste seluruh .env antar environment. Hardcode secret di source code. Commit .env ke git.",
        verificationChecklist: "Env audit script green, payment gateway test OK, secret scan clean",
        targetEvidence: "Diff output env, test transaction log, git-secrets scan result",
        primaryRisk: "Secret leak jika salah handle environment variable",
        readiness: "ready",
      },
      {
        id: "sc-004",
        title: "Nginx Reverse Proxy Routing Error",
        category: "deploy",
        difficulty: "medium",
        description: "Setelah deploy, path /api/* di-serve sebagai static file oleh Nginx alih-alih diproxy ke backend.",
        objective: "Perbaiki konfigurasi Nginx agar routing API benar tanpa downtime.",
        acceptanceCriteria: "API endpoint mengembalikan JSON, frontend tetap dilayani dari static, zero downtime.",
        safeSteps: "1. Backup konfigurasi Nginx saat ini\n2. Review location blocks\n3. Perbaiki proxy_pass directive\n4. nginx -t untuk validasi syntax\n5. Reload (bukan restart) Nginx",
        antiPatterns: "Langsung restart Nginx tanpa test config. Mengedit file di /etc/nginx langsung tanpa backup.",
        verificationChecklist: "nginx -t pass, curl /api/health returns JSON, frontend loads, SSL intact",
        targetEvidence: "nginx -t output, curl response, browser screenshot",
        primaryRisk: "Downtime jika config salah dan Nginx di-restart",
        readiness: "ready",
      },
      {
        id: "sc-005",
        title: "Missing Binary Dependency di CI",
        category: "dependency",
        difficulty: "easy",
        description: "Build CI gagal karena sharp module tidak bisa install, butuh libvips yang tidak ada di base image.",
        objective: "Perbaiki CI pipeline agar dependency native ter-install dengan benar.",
        acceptanceCriteria: "CI build green, image processing berfungsi, build time tidak bertambah signifikan.",
        safeSteps: "1. Identifikasi dependency yang missing\n2. Cek apakah ada alternative pure-JS\n3. Update Dockerfile/CI config\n4. Test build di branch terpisah\n5. Merge setelah green",
        antiPatterns: "Install dependency global di production server. Skip image optimization. Downgrade library tanpa evaluasi.",
        verificationChecklist: "CI green, image resize test pass, build time < 5 menit",
        targetEvidence: "CI log, test output, build timing",
        primaryRisk: "Bisa mempengaruhi image build yang sudah stable jika Dockerfile berubah",
        readiness: "ready",
      },
      {
        id: "sc-006",
        title: "Unsafe Migration pada Tabel dengan Jutaan Baris",
        category: "data",
        difficulty: "critical",
        description: "ALTER TABLE ADD COLUMN dengan default value pada tabel 5 juta baris bisa lock table selama menit.",
        objective: "Jalankan migration tanpa downtime dan tanpa table lock berkepanjangan.",
        acceptanceCriteria: "Kolom baru tersedia, zero downtime, lock time < 1 detik.",
        safeSteps: "1. Analisis migration SQL\n2. Gunakan ADD COLUMN tanpa default dulu\n3. Backfill secara batch\n4. Set default setelah backfill selesai\n5. Monitoring lock wait",
        antiPatterns: "ALTER TABLE dengan DEFAULT di satu command. Menjalankan saat peak traffic. Tidak ada rollback plan.",
        verificationChecklist: "Lock monitoring clean, kolom ada & terisi, app queries OK, latency normal",
        targetEvidence: "pg_stat_activity during migration, row count before/after, latency graph",
        primaryRisk: "Table lock menyebabkan downtime dan timeout cascade",
        readiness: "ready",
      },
      {
        id: "sc-007",
        title: "Data Validation Pipeline Corrupt",
        category: "data",
        difficulty: "hard",
        description: "Pipeline ETL menerima data dengan format tanggal yang berubah dari source, menyebabkan 12% record gagal parse.",
        objective: "Perbaiki pipeline agar toleran terhadap variasi format dan data yang sudah masuk bisa di-recovery.",
        acceptanceCriteria: "Pipeline handle multi-format, data corrupt ter-recovery, alert terpasang.",
        safeSteps: "1. Sample data corrupt untuk analisis\n2. Identifikasi semua format variasi\n3. Update parser dengan fallback\n4. Re-process batch yang gagal\n5. Pasang monitoring dan alert",
        antiPatterns: "Force parse dengan satu format. Drop record yang gagal tanpa log. Fix di production langsung.",
        verificationChecklist: "Parse rate 100%, recovery data cocok, alert trigger test OK",
        targetEvidence: "Before/after parse rate, recovered record count, alert log",
        primaryRisk: "Data loss jika recovery salah atau parser masih brittle",
        readiness: "ready",
      },
      {
        id: "sc-008",
        title: "Observability Gap: No Smoke Test Post-Deploy",
        category: "testing",
        difficulty: "medium",
        description: "Deploy berhasil tapi tidak ada smoke test otomatis, bug terdeteksi 2 jam kemudian oleh user.",
        objective: "Implementasi smoke test otomatis yang berjalan segera setelah setiap deploy.",
        acceptanceCriteria: "Smoke test berjalan < 30 detik post-deploy, gagal deploy otomatis rollback.",
        safeSteps: "1. Identifikasi critical paths\n2. Tulis smoke test script\n3. Integrasikan ke deploy pipeline\n4. Tambahkan auto-rollback on failure\n5. Test dengan intentional failure",
        antiPatterns: "Smoke test yang terlalu banyak (jadi slow). Test yang flaky. Skip smoke test karena 'kecil perubahannya'.",
        verificationChecklist: "Smoke test run < 30s, covers auth + API + DB, rollback works",
        targetEvidence: "Smoke test log, rollback test result, pipeline config",
        primaryRisk: "False positive bisa trigger rollback yang tidak perlu",
        readiness: "needs-review",
      },
    ];

    for (const s of scenarioData) {
      this.scenarios.set(s.id, s as Scenario);
    }

    // --- 6 Runs ---
    const runData: (InsertRun & { id: string })[] = [
      {
        id: "run-001",
        scenarioId: "sc-001",
        status: "passed",
        operatorNote: "Migration berhasil di sandbox, query test semua green. Durasi total 12 menit.",
        evidence: "prisma migrate status: clean, 3/3 query tests passed",
        safetyDecision: "allow-guarded-write",
        createdAt: "2026-03-15T10:00:00Z",
        updatedAt: "2026-03-15T10:12:00Z",
      },
      {
        id: "run-002",
        scenarioId: "sc-002",
        status: "passed",
        operatorNote: "IPv6 issue confirmed. Konfigurasi DNS preference ke IPv4-first berhasil.",
        evidence: "dig A berhasil, psql connect OK, latency normal",
        safetyDecision: "allow-read-only",
        createdAt: "2026-03-15T14:00:00Z",
        updatedAt: "2026-03-15T14:25:00Z",
      },
      {
        id: "run-003",
        scenarioId: "sc-004",
        status: "failed",
        operatorNote: "Nginx config syntax error pada try_files directive. Perlu perbaikan ulang.",
        evidence: "nginx -t failed: unexpected } at line 42",
        safetyDecision: "deny",
        createdAt: "2026-03-16T09:00:00Z",
        updatedAt: "2026-03-16T09:08:00Z",
      },
      {
        id: "run-004",
        scenarioId: "sc-006",
        status: "blocked",
        operatorNote: "Menunggu approval untuk migration di staging karena tabel memiliki FK constraint yang kompleks.",
        evidence: null,
        safetyDecision: "hold-for-approval",
        createdAt: "2026-03-17T08:00:00Z",
        updatedAt: "2026-03-17T08:05:00Z",
      },
      {
        id: "run-005",
        scenarioId: "sc-003",
        status: "running",
        operatorNote: "Sedang audit env variables di 3 environment.",
        evidence: null,
        safetyDecision: "allow-read-only",
        createdAt: "2026-03-18T10:00:00Z",
        updatedAt: "2026-03-18T10:30:00Z",
      },
      {
        id: "run-006",
        scenarioId: "sc-007",
        status: "planned",
        operatorNote: "Dijadwalkan untuk besok. Perlu sample data dari source terlebih dahulu.",
        evidence: null,
        safetyDecision: null,
        createdAt: "2026-03-18T16:00:00Z",
        updatedAt: "2026-03-18T16:00:00Z",
      },
    ];

    for (const r of runData) {
      this.runs.set(r.id, r as Run);
    }

    // --- 6 Safety Checks ---
    const safetyData: (InsertSafetyCheck & { id: string })[] = [
      {
        id: "sg-001",
        runId: "run-001",
        targetEnv: "sandbox",
        actionMode: "write",
        affectedAssets: "Database schema, tabel users dan orders",
        minVerification: "prisma migrate status, query test per model",
        recoveryPath: "Rollback migration dengan prisma migrate reset di sandbox",
        decision: "allow-guarded-write",
        reason: "Target sandbox, recovery path jelas, migration sudah di-review",
        createdAt: "2026-03-15T09:55:00Z",
      },
      {
        id: "sg-002",
        runId: "run-002",
        targetEnv: "dev",
        actionMode: "read-only",
        affectedAssets: "DNS config, network stack",
        minVerification: "dig + nc test sebelum perubahan",
        recoveryPath: "Revert /etc/resolv.conf dari backup",
        decision: "allow-read-only",
        reason: "Hanya diagnosis, tidak ada write ke system config",
        createdAt: "2026-03-15T13:55:00Z",
      },
      {
        id: "sg-003",
        runId: "run-003",
        targetEnv: "staging",
        actionMode: "write",
        affectedAssets: "Nginx config, web routing",
        minVerification: "nginx -t sebelum reload",
        recoveryPath: "Restore dari backup config di /etc/nginx/backup/",
        decision: "deny",
        reason: "Config mengandung syntax error, harus fix dulu sebelum apply",
        createdAt: "2026-03-16T08:55:00Z",
      },
      {
        id: "sg-004",
        runId: "run-004",
        targetEnv: "staging",
        actionMode: "write",
        affectedAssets: "Tabel transactions (5M rows), FK ke orders dan users",
        minVerification: "Lock monitoring, row count before/after, latency baseline",
        recoveryPath: "ALTER TABLE DROP COLUMN jika gagal, restore dari daily backup",
        decision: "hold-for-approval",
        reason: "Tabel besar dengan FK kompleks, butuh approval dan maintenance window",
        createdAt: "2026-03-17T07:55:00Z",
      },
      {
        id: "sg-005",
        runId: "run-005",
        targetEnv: "produksi",
        actionMode: "read-only",
        affectedAssets: "Environment variables di semua environment",
        minVerification: "Tidak ada write, hanya audit",
        recoveryPath: "N/A - read only",
        decision: "allow-read-only",
        reason: "Audit env tidak mengubah apa pun, aman untuk produksi",
        createdAt: "2026-03-18T09:55:00Z",
      },
      {
        id: "sg-006",
        runId: null,
        targetEnv: "sandbox",
        actionMode: "write",
        affectedAssets: "Pipeline ETL, staging database",
        minVerification: "Sample data test, parse rate check",
        recoveryPath: "Re-run pipeline dari checkpoint terakhir",
        decision: "allow-guarded-write",
        reason: "Target sandbox, pipeline bisa di-rerun, data bukan produksi",
        createdAt: "2026-03-18T15:00:00Z",
      },
    ];

    for (const sc of safetyData) {
      this.safetyChecks.set(sc.id, sc as SafetyCheck);
    }

    // --- 5 Lessons ---
    const lessonData: (InsertLesson & { id: string })[] = [
      {
        id: "les-001",
        title: "Koneksi database gagal karena IPv6-only resolution",
        context: "Sebuah VPS sandbox mencoba akses database eksternal, tetapi hostname resolve hanya ke IPv6",
        taxonomyL1: "network",
        taxonomyL2: "network/ipv6",
        symptom: "Server gagal konek ke database saat sync schema",
        rootCause: "Hostname database resolve hanya ke IPv6, jalur IPv6 tidak tersedia dari VPS",
        impact: "Operasi schema gagal, app bisa tetap hidup tapi tidak bisa migrate",
        prevention: "Cek DNS family dan konektivitas TCP sebelum menyimpulkan masalah whitelist atau firewall",
        status: "verified",
        promotion: "workflow",
        createdAt: "2026-03-18T08:00:00Z",
      },
      {
        id: "les-002",
        title: "Salah diagnosis IP allowlist database eksternal",
        context: "Bot menyarankan whitelist IP server internal 10.11.6.206 yang merupakan IP private",
        taxonomyL1: "safety",
        taxonomyL2: "safety/prod-write-risk",
        symptom: "IP internal disebut sebagai kandidat whitelist database",
        rootCause: "Gagal membedakan IP private host dengan IP publik egress server",
        impact: "User bisa mengambil tindakan yang tidak menyelesaikan masalah",
        prevention: "Selalu cek hostname -I dan IP publik sebelum saran allowlist jaringan",
        status: "verified",
        promotion: "checklist",
        createdAt: "2026-03-18T08:30:00Z",
      },
      {
        id: "les-003",
        title: "Prisma schema drift setelah merge branch",
        context: "Dua branch mengubah schema.prisma secara bersamaan, merge conflict tidak terdeteksi CI",
        taxonomyL1: "workflow",
        taxonomyL2: "workflow/skipped-verification",
        symptom: "prisma migrate status menunjukkan pending migration yang tidak sesuai schema",
        rootCause: "CI tidak menjalankan prisma validate setelah merge",
        impact: "Deploy gagal di staging, rollback manual diperlukan",
        prevention: "Tambahkan prisma validate dan prisma migrate status di CI post-merge",
        status: "verified",
        promotion: "workflow",
        createdAt: "2026-03-16T14:00:00Z",
      },
      {
        id: "les-004",
        title: "Deploy tanpa smoke test menyebabkan bug 2 jam",
        context: "Feature flag aktif di production tapi endpoint baru belum di-deploy, user dapat error 404",
        taxonomyL1: "testing",
        taxonomyL2: "testing/no-smoke-check",
        symptom: "User report 404 pada fitur baru, ops tidak mendeteksi sampai laporan masuk",
        rootCause: "Tidak ada smoke test otomatis post-deploy yang mengecek endpoint critical",
        impact: "2 jam downtime parsial, user experience buruk, reputasi terdampak",
        prevention: "Wajibkan smoke test pada critical paths segera setelah deploy, auto-rollback jika gagal",
        status: "partial",
        promotion: "workflow",
        createdAt: "2026-03-14T09:00:00Z",
      },
      {
        id: "les-005",
        title: "Table lock saat ALTER TABLE pada tabel besar",
        context: "Migration menambah kolom dengan default value ke tabel 5M rows di staging",
        taxonomyL1: "data",
        taxonomyL2: "data/unsafe-migration",
        symptom: "Query timeout cascade, staging down selama 3 menit",
        rootCause: "ALTER TABLE dengan DEFAULT pada tabel besar mengakuisisi ACCESS EXCLUSIVE lock",
        impact: "Staging downtime, semua query ter-block selama migration",
        prevention: "Gunakan ADD COLUMN tanpa default, lalu backfill batch, lalu set default",
        status: "hypothesis",
        promotion: "skill",
        createdAt: "2026-03-17T11:00:00Z",
      },
    ];

    for (const l of lessonData) {
      this.lessons.set(l.id, l as Lesson);
    }

    // --- 4 Reviews ---
    const reviewData: (InsertReview & { id: string })[] = [
      {
        id: "rev-001",
        runId: "run-001",
        taskGoal: "Sinkronisasi Prisma schema dengan database sandbox",
        finalResult: "Migration berhasil, semua query test passed, zero data loss",
        resultStatus: "selesai",
        evidence: "prisma migrate status: clean, 3/3 query assertions passed, row count unchanged",
        whatWorked: "Approach bertahap: review SQL dulu, jalankan di sandbox, lalu verifikasi",
        whatFailed: "Tidak ada kegagalan",
        nearMiss: "Hampir menjalankan db push langsung tanpa review SQL generated",
        safestNextStep: "Apply pattern yang sama untuk staging setelah validasi sandbox",
        createdAt: "2026-03-15T10:15:00Z",
      },
      {
        id: "rev-002",
        runId: "run-002",
        taskGoal: "Diagnosis dan fix koneksi database dari VPS",
        finalResult: "IPv6 issue teridentifikasi, konfigurasi IPv4 preference berhasil",
        resultStatus: "selesai",
        evidence: "dig A: resolved, psql connect: OK, latency 12ms (normal)",
        whatWorked: "Systematic DNS diagnosis per address family sebelum jump ke kesimpulan",
        whatFailed: "Awalnya curiga firewall — salah jalur diagnosis",
        nearMiss: "Hampir menyarankan whitelist IP internal yang tidak akan menyelesaikan masalah",
        safestNextStep: "Dokumentasikan DNS preference setting, monitor koneksi 24h",
        createdAt: "2026-03-15T14:30:00Z",
      },
      {
        id: "rev-003",
        runId: "run-003",
        taskGoal: "Perbaiki Nginx routing agar /api/* diproxy dengan benar",
        finalResult: "Config gagal validasi syntax, perlu iterasi ulang",
        resultStatus: "gagal",
        evidence: "nginx -t: syntax error at line 42",
        whatWorked: "Safety gate mencegah apply config yang salah",
        whatFailed: "Location block ordering salah, try_files directive konflik dengan proxy_pass",
        nearMiss: "Jika tidak test dengan nginx -t, config bisa di-apply dan menyebabkan downtime",
        safestNextStep: "Review Nginx documentation untuk location block precedence, fix dan test ulang",
        createdAt: "2026-03-16T09:15:00Z",
      },
      {
        id: "rev-004",
        runId: null,
        taskGoal: "Setup observability stack untuk sandbox lab",
        finalResult: "Logging dasar terpasang tapi alerting belum selesai",
        resultStatus: "partial",
        evidence: "Logs streaming ke stdout, Prometheus endpoint tersedia, Grafana belum dikonfigurasi",
        whatWorked: "Structured logging dengan JSON format mempermudah parsing",
        whatFailed: "Alerting rules terlalu kompleks untuk iterasi pertama",
        nearMiss: "Hampir menggunakan production Grafana instance untuk sandbox logs",
        safestNextStep: "Simplify alerting rules, gunakan Grafana lokal terpisah, iterasi bertahap",
        createdAt: "2026-03-17T15:00:00Z",
      },
    ];

    for (const r of reviewData) {
      this.reviews.set(r.id, r as Review);
    }
  }
}

export const storage = new MemStorage();
