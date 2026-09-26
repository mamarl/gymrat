import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const ACTIVITY_LEVELS = [
  { key: "sedentary", label: "Sedentary", extra: 0 },
  { key: "light", label: "Light", extra: 250 },
  { key: "moderate", label: "Moderate", extra: 500 },
  { key: "very_active", label: "Very Active", extra: 750 },
] as const;

type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]["key"];

type HistoricalWaterSnapshot = {
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal_ml: number | null;
  taking_creatine: boolean | null;
  creatine_grams: number | null;
};

type WaterHistoryDay = {
  date: string;
  total_ml: number;
  snapshot: HistoricalWaterSnapshot;
};

type WaterSettings = {
  weight_kg: number;
  activity_level: ActivityLevel;
  custom_goal_ml: number | null;
  taking_creatine: number;
  creatine_grams: number;
};

const getTodayKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T12:00:00`);
  const today = new Date(`${getTodayKey()}T12:00:00`);

  if (dateKey === getTodayKey()) return "Today";

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export default function WaterHistory() {
  const db = useSQLiteContext();
  const { userKey } = useAuth();
  const { isDark } = useTheme();
  const [history, setHistory] = useState<WaterHistoryDay[]>([]);

  const colors = {
    background: isDark ? "#0b0b0c" : "#f5f5f7",
    card: isDark ? "#151517" : "#ffffff",
    secondary: isDark ? "#1c1c1e" : "#eeeef1",
    border: isDark ? "#2a2a2c" : "#dedee2",
    primaryText: isDark ? "#fff" : "#111",
    secondaryText: isDark ? "#8a8a8e" : "#666",
    blue: "#38bdf8",
  };

  const loadSnapshotForDate = useCallback(
    async (dateKey: string): Promise<HistoricalWaterSnapshot | null> => {
      if (!userKey) return null;

      if (dateKey === getTodayKey()) {
        const current = await db.getFirstAsync<WaterSettings>(
          `
          SELECT weight_kg, activity_level, custom_goal_ml,
                 taking_creatine, creatine_grams
          FROM water_settings
          WHERE id = 1 AND user_key = ?
          LIMIT 1
          `,
          userKey
        );

        if (!current) return null;

        const activityExtra =
          ACTIVITY_LEVELS.find(
            (item) => item.key === current.activity_level
          )?.extra ?? 500;

        const recommended =
          current.weight_kg > 0
            ? Math.round(
                (
                  current.weight_kg * 35 +
                  activityExtra +
                  (current.taking_creatine === 1
                    ? current.creatine_grams * 125
                    : 0)
                ) / 50
              ) * 50
            : 2500;

        return {
          weight_kg: current.weight_kg || null,
          activity_level: current.activity_level || null,
          goal_ml:
            current.custom_goal_ml && current.custom_goal_ml > 0
              ? current.custom_goal_ml
              : recommended,
          taking_creatine: current.taking_creatine === 1,
          creatine_grams: current.creatine_grams || 0,
        };
      }

      const endOfDay = `${dateKey} 23:59:59`;

      const weightRow = await db.getFirstAsync<{ weight_kg: number }>(
        `
        SELECT weight_kg
        FROM weight_history
        WHERE user_key = ? AND created_at <= ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        `,
        userKey,
        endOfDay
      );

      const activityRow =
        await db.getFirstAsync<{ activity_level: ActivityLevel }>(
          `
          SELECT activity_level
          FROM activity_history
          WHERE user_key = ? AND created_at <= ?
          ORDER BY created_at DESC, id DESC
          LIMIT 1
          `,
          userKey,
          endOfDay
        );

      const goalRow = await db.getFirstAsync<{ goal_ml: number }>(
        `
        SELECT goal_ml
        FROM water_goal_history
        WHERE user_key = ? AND created_at <= ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        `,
        userKey,
        endOfDay
      );

      const creatineRow =
        await db.getFirstAsync<{
          taking_creatine: number;
          creatine_grams: number;
        }>(
          `
          SELECT taking_creatine, creatine_grams
          FROM creatine_history
          WHERE user_key = ? AND created_at <= ?
          ORDER BY created_at DESC, id DESC
          LIMIT 1
          `,
          userKey,
          endOfDay
        );

      let goal = goalRow?.goal_ml ?? null;

      if (goal === null && weightRow && activityRow && creatineRow) {
        const activityExtra =
          ACTIVITY_LEVELS.find(
            (item) => item.key === activityRow.activity_level
          )?.extra ?? 500;

        goal =
          Math.round(
            (
              weightRow.weight_kg * 35 +
              activityExtra +
              (creatineRow.taking_creatine === 1
                ? creatineRow.creatine_grams * 125
                : 0)
            ) / 50
          ) * 50;
      }

      if (!weightRow && !activityRow && !goalRow && !creatineRow) {
        return null;
      }

      return {
        weight_kg: weightRow?.weight_kg ?? null,
        activity_level: activityRow?.activity_level ?? null,
        goal_ml: goal,
        taking_creatine: creatineRow
          ? creatineRow.taking_creatine === 1
          : null,
        creatine_grams: creatineRow?.creatine_grams ?? null,
      };
    },
    [db, userKey]
  );

  const loadHistory = useCallback(async () => {
    if (!userKey) {
      setHistory([]);
      return;
    }

    try {
      const days = await db.getAllAsync<{
        date: string;
        total_ml: number;
      }>(
        `
        SELECT date(created_at) AS date, SUM(amount_ml) AS total_ml
        FROM water_logs
        WHERE user_key = ?
        GROUP BY date(created_at)
        ORDER BY date DESC
        `,
        userKey
      );

      const result: WaterHistoryDay[] = [];

      for (const day of days) {
        const snapshot = await loadSnapshotForDate(day.date);

        result.push({
          date: day.date,
          total_ml: Number(day.total_ml) || 0,
          snapshot: snapshot || {
            weight_kg: null,
            activity_level: null,
            goal_ml: null,
            taking_creatine: null,
            creatine_grams: null,
          },
        });
      }

      setHistory(result);
    } catch (error) {
      console.log("LOAD WATER HISTORY ERROR:", error);
    }
  }, [db, userKey, loadSnapshotForDate]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          style={[styles.backButton, { backgroundColor: colors.secondary }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.backText, { color: colors.blue }]}>‹</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: colors.primaryText }]}>Water History</Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>Your previous hydration records</Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {history.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>No water history yet</Text>
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>Start logging your water intake and your daily records will appear here.</Text>
          </View>
        ) : (
          history.map((day) => {
            const goal = day.snapshot.goal_ml;
            const percent =
              goal && goal > 0
                ? Math.round((day.total_ml / goal) * 100)
                : null;
            const reached = goal !== null && day.total_ml >= goal;
            const activityLabel = day.snapshot.activity_level
              ? ACTIVITY_LEVELS.find(
                  (item) => item.key === day.snapshot.activity_level
                )?.label || day.snapshot.activity_level
              : "Activity unavailable";

            return (
              <View
                key={day.date}
                style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.topRow}>
                  <Text style={[styles.date, { color: colors.primaryText }]}>
                    {getDateLabel(day.date)}
                  </Text>
                  <Text style={[styles.amount, { color: colors.blue }]}>
                    {day.total_ml.toLocaleString()} ml
                  </Text>
                </View>

                <Text style={[styles.goalLine, { color: colors.secondaryText }]}>
                  💧 {day.total_ml.toLocaleString()} / {goal ? goal.toLocaleString() : "—"} ml
                </Text>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <Text style={[styles.detail, { color: colors.secondaryText }]}>🏃 {activityLabel}{day.snapshot.weight_kg !== null ? ` • ${day.snapshot.weight_kg} kg` : ""}</Text>

                <Text style={[styles.detail, { color: colors.secondaryText }]}>🧪 {day.snapshot.taking_creatine === null ? "Creatine unavailable" : day.snapshot.taking_creatine ? `${day.snapshot.creatine_grams || 0}g` : "No creatine"}</Text>

                <Text style={[styles.status, { color: reached ? colors.blue : colors.secondaryText }]}>
                  {reached
                    ? "✓ Goal completed"
                    : percent !== null
                    ? `${percent}% of goal`
                    : "Goal unavailable"}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 32,
    lineHeight: 34,
    fontWeight: "300",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },
  headerSpacer: {
    width: 44,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 11,
    marginTop: 3,
  },
  historyCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  date: {
    fontSize: 16,
    fontWeight: "800",
    flex: 1,
  },
  amount: {
    fontSize: 15,
    fontWeight: "800",
  },
  goalLine: {
    fontSize: 13,
  },
  divider: {
    height: 1,
    marginVertical: 11,
  },
  detail: {
    fontSize: 12,
    marginTop: 5,
  },
  status: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 9,
  },
  emptyCard: {
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 7,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
