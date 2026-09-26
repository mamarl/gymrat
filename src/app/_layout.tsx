import { Stack, router, useSegments } from "expo-router";
import {
  SQLiteProvider,
  type SQLiteDatabase,
} from "expo-sqlite";
import { useEffect } from "react";
import {
  ActivityIndicator,
  View,
} from "react-native";

import {
  AuthProvider,
  useAuth,
} from "../context/AuthContext";

import {
  ThemeProvider,
} from "../context/ThemeContext";

const LATEST_VERSION = 11;

async function initDb(db: SQLiteDatabase) {
  const row =
    await db.getFirstAsync<{ user_version: number }>(
      "PRAGMA user_version"
    );

  const version = row?.user_version ?? 0;

  // =========================
  // VERSION 1
  // =========================
  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exercise TEXT NOT NULL,
        weight REAL NOT NULL,
        reps INTEGER NOT NULL,
        created_at TEXT NOT NULL
          DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS water_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount_ml INTEGER NOT NULL,
        created_at TEXT NOT NULL
          DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS routines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS routine_exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        routine_id INTEGER NOT NULL,
        exercise TEXT NOT NULL,
        position INTEGER NOT NULL
      );
    `);
  }

  // =========================
  // VERSION 2
  // =========================
  if (version < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        routine_id INTEGER,
        name TEXT NOT NULL,
        started_at TEXT NOT NULL
          DEFAULT (datetime('now', 'localtime')),
        ended_at TEXT
      );

      ALTER TABLE sets
      ADD COLUMN workout_id INTEGER;
    `);
  }

  // =========================
  // VERSION 3
  // Water settings
  // =========================
  if (version < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS water_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        weight_kg REAL NOT NULL DEFAULT 0,
        activity_level TEXT NOT NULL DEFAULT 'moderate',
        custom_goal_ml INTEGER
      );

      INSERT OR IGNORE INTO water_settings (
        id,
        weight_kg,
        activity_level,
        custom_goal_ml
      )
      VALUES (
        1,
        0,
        'moderate',
        NULL
      );
    `);
  }

  // =========================
  // VERSION 4
  // Creatine settings
  // =========================
  if (version < 4) {
    await db.execAsync(`
      ALTER TABLE water_settings
      ADD COLUMN taking_creatine INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE water_settings
      ADD COLUMN creatine_grams REAL NOT NULL DEFAULT 0;
    `);
  }

  // =========================
  // VERSION 5
  // Workout server sync
  // =========================
  if (version < 5) {
    await db.execAsync(`
      ALTER TABLE workouts
      ADD COLUMN server_id INTEGER;

      ALTER TABLE workouts
      ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
    `);
  }

  // =========================
  // VERSION 6
  // Routine server sync
  // =========================
  if (version < 6) {
    await db.execAsync(`
      ALTER TABLE routines
      ADD COLUMN server_id INTEGER;
    `);
  }

  // =========================
  // VERSION 7
  // Water server sync
  // =========================
  if (version < 7) {
    await db.execAsync(`
      ALTER TABLE water_logs
      ADD COLUMN server_id INTEGER;
    `);
  }

  // =========================
  // VERSION 8
  // Weight history
  // =========================
  if (version < 8) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS weight_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        weight_kg REAL NOT NULL,
        created_at TEXT NOT NULL
          DEFAULT (datetime('now', 'localtime'))
      );
    `);
  }

  // =========================
  // VERSION 9
  // History for body & goals
  // =========================
  if (version < 9) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS activity_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_level TEXT NOT NULL,
        created_at TEXT NOT NULL
          DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS water_goal_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_ml INTEGER NOT NULL,
        created_at TEXT NOT NULL
          DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS creatine_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        taking_creatine INTEGER NOT NULL,
        creatine_grams REAL NOT NULL,
        created_at TEXT NOT NULL
          DEFAULT (datetime('now', 'localtime'))
      );
    `);
  }

  // =========================
  // VERSION 10
  // Routine creation date/time
  // =========================
  if (version < 10) {
    await db.execAsync(`
      ALTER TABLE routines
      ADD COLUMN created_at TEXT;
    `);

    await db.execAsync(`
      UPDATE routines
      SET created_at = datetime('now', 'localtime')
      WHERE created_at IS NULL;
    `);
  }

  // =========================
  // VERSION 11
  // LOCAL ACCOUNT SEPARATION
  // =========================
  if (version < 11) {
    // -------------------------
    // Routines
    // -------------------------
    await db.execAsync(`
      ALTER TABLE routines
      ADD COLUMN user_key TEXT;
    `);

    // -------------------------
    // Routine exercises
    // -------------------------
    await db.execAsync(`
      ALTER TABLE routine_exercises
      ADD COLUMN user_key TEXT;
    `);

    // -------------------------
    // Workouts
    // -------------------------
    await db.execAsync(`
      ALTER TABLE workouts
      ADD COLUMN user_key TEXT;
    `);

    // -------------------------
    // Sets
    // -------------------------
    await db.execAsync(`
      ALTER TABLE sets
      ADD COLUMN user_key TEXT;
    `);

    // -------------------------
    // Water logs
    // -------------------------
    await db.execAsync(`
      ALTER TABLE water_logs
      ADD COLUMN user_key TEXT;
    `);

    // -------------------------
    // Water settings
    // -------------------------
    await db.execAsync(`
      ALTER TABLE water_settings
      ADD COLUMN user_key TEXT;
    `);

    // -------------------------
    // Weight history
    // -------------------------
    await db.execAsync(`
      ALTER TABLE weight_history
      ADD COLUMN user_key TEXT;
    `);

    // -------------------------
    // Activity history
    // -------------------------
    await db.execAsync(`
      ALTER TABLE activity_history
      ADD COLUMN user_key TEXT;
    `);

    // -------------------------
    // Water goal history
    // -------------------------
    await db.execAsync(`
      ALTER TABLE water_goal_history
      ADD COLUMN user_key TEXT;
    `);

    // -------------------------
    // Creatine history
    // -------------------------
    await db.execAsync(`
      ALTER TABLE creatine_history
      ADD COLUMN user_key TEXT;
    `);
  }

  // =========================
  // UPDATE DATABASE VERSION
  // =========================
  await db.execAsync(
    `PRAGMA user_version = ${LATEST_VERSION}`
  );
}

// =========================
// AUTH GATE
// =========================

function AuthGate() {
  const { token, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const inAuthScreen =
      segments[0] === "login" ||
      segments[0] === "register";

    // =========================
    // USER IS LOGGED OUT
    // =========================
    if (!token && !inAuthScreen) {
      router.replace("/login");
    }

    // =========================
    // USER IS LOGGED IN
    // =========================
    if (token && inAuthScreen) {
      router.replace("/(tabs)");
    }
  }, [token, isLoading, segments]);

  // =========================
  // LOADING SCREEN
  // =========================
  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0b0b0c",
        }}
      >
        <ActivityIndicator
          size="large"
          color="#fff"
        />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}

// =========================
// ROOT LAYOUT
// =========================

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <SQLiteProvider
          databaseName="gymrat.db"
          onInit={initDb}
        >
          <AuthGate />
        </SQLiteProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}