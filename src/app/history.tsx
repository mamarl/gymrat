import { Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

type Workout = {
  id: number;
  name: string;
  started_at: string;
  ended_at: string | null;
};

type SetRow = {
  id: number;
  exercise: string;
  weight: number;
  reps: number;
  created_at: string;
};

type WorkoutHistory = Workout & {
  sets: SetRow[];
  volume: number;
};

type ThemeColors = {
  background: string;
  card: string;
  border: string;
  divider: string;
  text: string;
  muted: string;
  secondaryText: string;
  green: string;
  setText: string;
  xText: string;
  danger: string;
};

export default function History() {
  const db = useSQLiteContext();
  const { isDark } = useTheme();
  const { userKey } = useAuth();

  const { routineId } =
    useLocalSearchParams<{ routineId?: string }>();

  const colors: ThemeColors = isDark
    ? {
        background: "#0b0b0c",
        card: "#141416",
        border: "#2a2a2c",
        divider: "#242426",
        text: "#ffffff",
        muted: "#8a8a8e",
        secondaryText: "#dddddd",
        green: "#22c55e",
        setText: "#dddddd",
        xText: "#666666",
        danger: "#ef4444",
      }
    : {
        background: "#f5f5f7",
        card: "#ffffff",
        border: "#d7d7dc",
        divider: "#e5e5e8",
        text: "#111114",
        muted: "#66666d",
        secondaryText: "#333338",
        green: "#16a34a",
        setText: "#333338",
        xText: "#99999f",
        danger: "#ef4444",
      };

  const styles = createStyles(colors);

  const [routineName, setRoutineName] =
    useState("Workout History");

  const [history, setHistory] =
    useState<WorkoutHistory[]>([]);

  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    if (!userKey) {
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let workouts: Workout[] = [];

      /*
       * If routineId exists:
       * show only workouts from that routine
       * belonging to the current account.
       *
       * If there is no routineId:
       * show all completed workouts belonging
       * to the current account.
       */

      if (routineId) {
        const rid = Number(routineId);

        const routine =
          await db.getFirstAsync<{ name: string }>(
            `SELECT name
             FROM routines
             WHERE id = ?
             AND user_key = ?`,
            rid,
            userKey
          );

        if (routine) {
          setRoutineName(routine.name);
        } else {
          setRoutineName("Workout History");
        }

        workouts =
          await db.getAllAsync<Workout>(
            `SELECT
              id,
              name,
              started_at,
              ended_at
             FROM workouts
             WHERE routine_id = ?
               AND user_key = ?
               AND ended_at IS NOT NULL
             ORDER BY started_at DESC`,
            rid,
            userKey
          );
      } else {
        setRoutineName("Workout History");

        workouts =
          await db.getAllAsync<Workout>(
            `SELECT
              id,
              name,
              started_at,
              ended_at
             FROM workouts
             WHERE user_key = ?
               AND ended_at IS NOT NULL
             ORDER BY started_at DESC`,
            userKey
          );
      }

      const result: WorkoutHistory[] = [];

      for (const workout of workouts) {
        const sets =
          await db.getAllAsync<SetRow>(
            `SELECT
              id,
              exercise,
              weight,
              reps,
              created_at
             FROM sets
             WHERE workout_id = ?
               AND user_key = ?
             ORDER BY id ASC`,
            workout.id,
            userKey
          );

        const volume = sets.reduce(
          (total, set) =>
            total + set.weight * set.reps,
          0
        );

        result.push({
          ...workout,
          sets,
          volume,
        });
      }

      setHistory(result);
    } catch (error) {
      console.log(
        "Failed to load workout history:",
        error
      );

      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [db, routineId, userKey]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /*
   * DELETE WORKOUT HISTORY
   */
  const deleteWorkout = (workoutId: number) => {
    Alert.alert(
      "Delete Workout?",
      "This will permanently delete this workout and all of its recorded sets.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!userKey) return;

            try {
              /*
               * Delete all sets belonging to
               * this workout and current user.
               */
              await db.runAsync(
                `
                DELETE FROM sets
                WHERE workout_id = ?
                  AND user_key = ?
                `,
                workoutId,
                userKey
              );

              /*
               * Delete the workout itself.
               */
              await db.runAsync(
                `
                DELETE FROM workouts
                WHERE id = ?
                  AND user_key = ?
                `,
                workoutId,
                userKey
              );

              console.log(
                "WORKOUT HISTORY DELETED:",
                workoutId
              );

              /*
               * Refresh the history screen.
               */
              await loadHistory();
            } catch (error) {
              console.error(
                "DELETE WORKOUT ERROR:",
                error
              );

              Alert.alert(
                "Error",
                "Failed to delete workout history."
              );
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    if (!dateString) {
      return "Unknown date";
    }

    const date = new Date(
      dateString.replace(" ", "T")
    );

    if (isNaN(date.getTime())) {
      return dateString.slice(0, 10);
    }

    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    if (!dateString) {
      return "";
    }

    const date = new Date(
      dateString.replace(" ", "T")
    );

    if (isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getWorkoutDuration = (
    started: string,
    ended: string | null
  ) => {
    if (!ended) {
      return "";
    }

    const start = new Date(
      started.replace(" ", "T")
    ).getTime();

    const end = new Date(
      ended.replace(" ", "T")
    ).getTime();

    if (isNaN(start) || isNaN(end)) {
      return "";
    }

    const minutes = Math.max(
      0,
      Math.round((end - start) / 60000)
    );

    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;

    return `${hours}h ${remaining}m`;
  };

  /*
   * Group sets by exercise
   */
  const groupExercises = (sets: SetRow[]) => {
    const grouped: {
      [key: string]: SetRow[];
    } = {};

    for (const set of sets) {
      if (!grouped[set.exercise]) {
        grouped[set.exercise] = [];
      }

      grouped[set.exercise].push(set);
    }

    return Object.entries(grouped);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "History",
          headerStyle: {
            backgroundColor:
              colors.background,
          },
          headerTintColor:
            colors.text,
          headerShadowVisible: false,
        }}
      />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator
            size="large"
            color={colors.green}
          />
        </View>
      ) : history.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>
            📋
          </Text>

          <Text style={styles.emptyTitle}>
            No workout history yet
          </Text>

          <Text style={styles.emptyText}>
            Complete a workout and it will
            appear here.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 40,
          }}
        >
          <Text style={styles.title}>
            {routineName}
          </Text>

          <Text style={styles.subtitle}>
            {history.length} completed{" "}
            {history.length === 1
              ? "workout"
              : "workouts"}
          </Text>

          {history.map((workout) => {
            const grouped =
              groupExercises(workout.sets);

            return (
              <View
                key={workout.id}
                style={styles.workoutCard}
              >
                {/* WORKOUT TITLE + DELETE */}
                <View style={styles.workoutTitleRow}>
                  <Text style={styles.workoutName}>
                    {workout.name}
                  </Text>

                  <Pressable
                    onPress={() =>
                      deleteWorkout(workout.id)
                    }
                    style={styles.deleteButton}
                  >
                    <Text
                      style={
                        styles.deleteButtonText
                      }
                    >
                      Delete
                    </Text>
                  </Pressable>
                </View>

                {/* DATE HEADER */}
                <View
                  style={
                    styles.workoutHeader
                  }
                >
                  <View>
                    <Text style={styles.date}>
                      {formatDate(
                        workout.started_at
                      )}
                    </Text>

                    <Text style={styles.time}>
                      {formatTime(
                        workout.started_at
                      )}

                      {workout.ended_at
                        ? ` · ${getWorkoutDuration(
                            workout.started_at,
                            workout.ended_at
                          )}`
                        : ""}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.volumeBox
                    }
                  >
                    <Text
                      style={
                        styles.volumeLabel
                      }
                    >
                      VOLUME
                    </Text>

                    <Text
                      style={styles.volume}
                    >
                      {Math.round(
                        workout.volume
                      )}{" "}
                      kg
                    </Text>
                  </View>
                </View>

                {/* NO SETS */}
                {workout.sets.length === 0 && (
                  <Text
                    style={styles.noSets}
                  >
                    No exercises or sets recorded.
                  </Text>
                )}

                {/* EXERCISES */}
                {grouped.map(
                  ([exercise, exerciseSets]) => (
                    <View
                      key={exercise}
                      style={
                        styles.exercise
                      }
                    >
                      <Text
                        style={
                          styles.exerciseName
                        }
                      >
                        {exercise}
                      </Text>

                      {exerciseSets.map(
                        (set, index) => (
                          <View
                            key={set.id}
                            style={
                              styles.setRow
                            }
                          >
                            <Text
                              style={
                                styles.setNumber
                              }
                            >
                              {index + 1}
                            </Text>

                            <Text
                              style={
                                styles.setValue
                              }
                            >
                              {set.weight} kg
                            </Text>

                            <Text
                              style={styles.x}
                            >
                              ×
                            </Text>

                            <Text
                              style={
                                styles.setValue
                              }
                            >
                              {set.reps} reps
                            </Text>
                          </View>
                        )
                      )}
                    </View>
                  )
                )}

                {/* WORKOUT TOTAL */}
                <View
                  style={styles.totalRow}
                >
                  <Text
                    style={
                      styles.totalLabel
                    }
                  >
                    {workout.sets.length}{" "}
                    {workout.sets.length === 1
                      ? "set"
                      : "sets"}
                  </Text>

                  <Text
                    style={
                      styles.totalValue
                    }
                  >
                    {Math.round(
                      workout.volume
                    )}{" "}
                    kg total volume
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(
  colors: ThemeColors
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        colors.background,
    },

    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },

    title: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "800",
    },

    subtitle: {
      color: colors.muted,
      fontSize: 15,
      marginTop: 4,
      marginBottom: 18,
    },

    workoutCard: {
      backgroundColor:
        colors.card,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
    },

    workoutTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },

    workoutName: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      flex: 1,
      marginRight: 10,
    },

    deleteButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },

    deleteButtonText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "700",
    },

    workoutHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor:
        colors.border,
    },

    date: {
      color: colors.text,
      fontSize: 17,
      fontWeight: "700",
    },

    time: {
      color: colors.muted,
      fontSize: 13,
      marginTop: 4,
    },

    volumeBox: {
      alignItems: "flex-end",
    },

    volumeLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: "700",
    },

    volume: {
      color: colors.green,
      fontSize: 16,
      fontWeight: "800",
      marginTop: 2,
    },

    exercise: {
      paddingTop: 14,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor:
        colors.divider,
    },

    exerciseName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 8,
    },

    setRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 6,
    },

    setNumber: {
      color: colors.muted,
      width: 28,
      fontSize: 14,
    },

    setValue: {
      color: colors.setText,
      fontSize: 14,
    },

    x: {
      color: colors.xText,
      marginHorizontal: 8,
    },

    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 14,
    },

    totalLabel: {
      color: colors.muted,
      fontSize: 13,
    },

    totalValue: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "600",
    },

    noSets: {
      color: colors.muted,
      fontSize: 14,
      marginTop: 14,
      fontStyle: "italic",
    },

    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 40,
    },

    emptyIcon: {
      fontSize: 42,
      marginBottom: 12,
    },

    emptyTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "700",
      textAlign: "center",
    },

    emptyText: {
      color: colors.muted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 21,
      marginTop: 8,
    },
  });
}