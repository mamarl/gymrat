import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

type WaterGoalHistory = {
  id: number;
  goal_ml: number;
  created_at: string;
};

export default function WaterGoalHistory() {
  const db = useSQLiteContext();
  const { userKey } = useAuth();
  const { isDark } = useTheme();

  const colors = isDark
    ? {
        background: "#0b0b0c",
        card: "#141416",
        border: "#2a2a2c",
        text: "#fff",
        muted: "#8a8a8e",
        secondary: "#77777c",
        primary: "#22c55e",
      }
    : {
        background: "#f5f5f7",
        card: "#ffffff",
        border: "#d7d7dc",
        text: "#111114",
        muted: "#66666d",
        secondary: "#77777e",
        primary: "#16a34a",
      };

  const styles = createStyles(colors);

  const [history, setHistory] = useState<WaterGoalHistory[]>([]);

  const loadHistory = useCallback(async () => {
    if (!userKey) {
      setHistory([]);
      return;
    }

    try {
      const rows = await db.getAllAsync<WaterGoalHistory>(
        `
        SELECT
          id,
          goal_ml,
          created_at
        FROM water_goal_history
        WHERE user_key = ?
        ORDER BY datetime(created_at) DESC
        `,
        userKey
      );

      setHistory(rows);
    } catch (error) {
      console.log(
        "WATER GOAL HISTORY: Failed to load history:",
        error
      );
    }
  }, [db, userKey]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString.replace(" ", "T"));

    return date.toLocaleDateString(undefined, {
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

        <Text style={styles.title}>
          Water Goal History
        </Text>

        <View style={styles.headerSpacer} />
      </View>

      {/* HISTORY */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              No history yet
            </Text>

            <Text style={styles.emptyText}>
              Your water goal changes will appear here.
            </Text>
          </View>
        ) : (
          history.map((item) => (
            <View
              key={item.id}
              style={styles.historyCard}
            >
              <View>
                <Text style={styles.goal}>
                  {item.goal_ml} ml
                </Text>

                <Text style={styles.date}>
                  {formatDate(item.created_at)}
                </Text>
              </View>

              <Text style={styles.time}>
                {formatTime(item.created_at)}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: {
  background: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  secondary: string;
  primary: string;
}) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    header: {
      height: 100,
      paddingTop: 48,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    backButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },

    backText: {
      color: colors.text,
      fontSize: 38,
      fontWeight: "300",
      lineHeight: 40,
    },

    title: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "700",
    },

    headerSpacer: {
      width: 40,
    },

    scroll: {
      flex: 1,
    },

    content: {
      padding: 16,
      paddingBottom: 40,
    },

    historyCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },

    goal: {
      color: colors.primary,
      fontSize: 17,
      fontWeight: "700",
      marginBottom: 5,
    },

    date: {
      color: colors.muted,
      fontSize: 13,
    },

    time: {
      color: colors.secondary,
      fontSize: 13,
    },

    emptyCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 24,
      alignItems: "center",
      marginTop: 10,
    },

    emptyTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "700",
      marginBottom: 8,
    },

    emptyText: {
      color: colors.secondary,
      fontSize: 14,
      textAlign: "center",
    },
  });
}