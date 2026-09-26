import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

type WeightEntry = {
  id: number;
  weight_kg: number;
  created_at: string;
};

export default function WeightHistory() {
  const db = useSQLiteContext();
  const { userKey } = useAuth();
  const { isDark } = useTheme();

  const colors = isDark
    ? {
        background: "#0b0b0c",
        surface: "#1c1c1e",
        card: "#141416",
        border: "#2a2a2c",
        divider: "#242426",
        text: "#fff",
        muted: "#8a8a8e",
        secondary: "#77777c",
        primary: "#22c55e",
      }
    : {
        background: "#f5f5f7",
        surface: "#ffffff",
        card: "#ffffff",
        border: "#d7d7dc",
        divider: "#e5e5e8",
        text: "#111114",
        muted: "#66666d",
        secondary: "#77777e",
        primary: "#16a34a",
      };

  const styles = createStyles(colors);

  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWeightHistory = useCallback(async () => {
    if (!userKey) {
      setEntries([]);
      setLoading(false);
      return;
    }

    try {
      const rows = await db.getAllAsync<WeightEntry>(
        `
        SELECT
          id,
          weight_kg,
          created_at
        FROM weight_history
        WHERE user_key = ?
        ORDER BY datetime(created_at) DESC
        `,
        userKey
      );

      setEntries(rows);
    } catch (error) {
      console.log("WEIGHT HISTORY LOAD ERROR:", error);
    } finally {
      setLoading(false);
    }
  }, [db, userKey]);

  useEffect(() => {
    loadWeightHistory();
  }, [loadWeightHistory]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString.replace(" ", "T"));

    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString.replace(" ", "T"));

    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}

      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <Text style={styles.title}>Weight History</Text>

        <View style={styles.headerSpacer} />
      </View>

      {/* CONTENT */}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.subtitle}>
          Track your body weight over time
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator
              size="large"
              color={colors.primary}
            />
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No weight history yet
            </Text>

            <Text style={styles.emptyText}>
              Change your weight in Water Settings to start
              tracking your progress.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            {entries.map((entry, index) => (
              <View key={entry.id}>
                <View style={styles.entry}>
                  <View>
                    <Text style={styles.date}>
                      {formatDate(entry.created_at)}
                    </Text>

                    <Text style={styles.time}>
                      {formatTime(entry.created_at)}
                    </Text>
                  </View>

                  <Text style={styles.weight}>
                    {entry.weight_kg} kg
                  </Text>
                </View>

                {index < entries.length - 1 && (
                  <View style={styles.divider} />
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: {
  background: string;
  surface: string;
  card: string;
  border: string;
  divider: string;
  text: string;
  muted: string;
  secondary: string;
  primary: string;
}) {
  return {
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
    },

    backButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.surface,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },

    backText: {
      color: colors.primary,
      fontSize: 34,
      lineHeight: 36,
      fontWeight: "300" as const,
    },

    title: {
      flex: 1,
      color: colors.text,
      fontSize: 22,
      fontWeight: "700" as const,
      textAlign: "center" as const,
    },

    headerSpacer: {
      width: 44,
    },

    content: {
      padding: 16,
      paddingBottom: 40,
    },

    subtitle: {
      color: colors.muted,
      fontSize: 14,
      marginBottom: 18,
    },

    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      overflow: "hidden" as const,
    },

    entry: {
      minHeight: 76,
      paddingHorizontal: 16,
      paddingVertical: 14,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },

    date: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "600" as const,
    },

    time: {
      color: colors.secondary,
      fontSize: 12,
      marginTop: 4,
    },

    weight: {
      color: colors.primary,
      fontSize: 18,
      fontWeight: "700" as const,
    },

    divider: {
      height: 1,
      backgroundColor: colors.divider,
      marginHorizontal: 16,
    },

    emptyCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 24,
      alignItems: "center" as const,
    },

    emptyTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "700" as const,
      marginBottom: 8,
    },

    emptyText: {
      color: colors.secondary,
      fontSize: 13,
      textAlign: "center" as const,
      lineHeight: 19,
    },

    loading: {
      paddingTop: 40,
      alignItems: "center" as const,
    },
  };
}