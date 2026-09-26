import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";

import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { apiFetch } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

type Routine = {
  id: number;
  name: string;
  exercises: string;
  server_id: number | null;
  created_at: string | null;
};

type BackendSet = {
  id: number;
  exercise: string;
  weight: number;
  reps: number;
  created_at: string;
};

type BackendWorkout = {
  id: number;
  name: string;
  started_at: string;
  ended_at: string | null;
  sets: BackendSet[];
};

type BackendRoutineExercise = {
  id: number;
  exercise: string;
  position: number;
};

type BackendRoutine = {
  id: number;
  name: string;
  exercises: BackendRoutineExercise[];
};

export default function Workout() {
  console.log("🔥 NEW INDEX FILE LOADED");

  const db = useSQLiteContext();
  const { token, userKey } = useAuth();
  const { isDark } = useTheme();

  const [routines, setRoutines] =
    useState<Routine[]>([]);

  /*
   * THEME COLORS
   */
  const colors = {
    background: isDark ? "#0b0b0c" : "#f5f5f7",
    card: isDark ? "#141416" : "#ffffff",
    row: isDark ? "#1c1c1e" : "#ffffff",
    secondary: isDark ? "#242426" : "#e8e8eb",
    border: isDark ? "#2a2a2c" : "#dedee2",

    primaryText: isDark ? "#fff" : "#111",
    secondaryText: isDark ? "#8a8a8e" : "#666",
    mutedText: isDark ? "#6f6f73" : "#888",

    icon: isDark ? "#fff" : "#222",

    green: "#22c55e",
  };

  /*
   * FORMAT ROUTINE CREATION DATE
   */
  const formatCreatedAt = (
    createdAt: string | null
  ) => {
    if (!createdAt) {
      return "Created date unavailable";
    }

    const date = new Date(createdAt);

    if (isNaN(date.getTime())) {
      return "Created date unavailable";
    }

    return `Created ${date.toLocaleDateString(
      undefined,
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    )} at ${date.toLocaleTimeString(
      undefined,
      {
        hour: "numeric",
        minute: "2-digit",
      }
    )}`;
  };

  /*
   * =========================================================
   * CLAIM OLD LOCAL DATA
   * =========================================================
   *
   * Your database existed before user accounts were added.
   *
   * Therefore, old records have:
   *
   * user_key = NULL
   *
   * The first account that uses this upgraded database
   * claims those old records.
   *
   * This only affects records whose user_key is NULL.
   *
   * Once claimed, another account cannot claim them.
   */
  const claimOldLocalData = useCallback(async () => {
    if (!userKey) {
      return;
    }

    try {
      console.log(
        "ACCOUNT SETUP: Checking for old unassigned local data..."
      );

      /*
       * ROUTINES
       */
      await db.runAsync(
        `
        UPDATE routines
        SET user_key = ?
        WHERE user_key IS NULL
        `,
        userKey
      );

      /*
       * ROUTINE EXERCISES
       *
       * Only claim exercises belonging to routines
       * that now belong to this user.
       */
      await db.runAsync(
        `
        UPDATE routine_exercises
        SET user_key = ?
        WHERE user_key IS NULL
          AND routine_id IN (
            SELECT id
            FROM routines
            WHERE user_key = ?
          )
        `,
        userKey,
        userKey
      );

      /*
       * WORKOUTS
       */
      await db.runAsync(
        `
        UPDATE workouts
        SET user_key = ?
        WHERE user_key IS NULL
        `,
        userKey
      );

      /*
       * SETS
       *
       * Only claim sets belonging to workouts
       * belonging to this user.
       */
      await db.runAsync(
        `
        UPDATE sets
        SET user_key = ?
        WHERE user_key IS NULL
          AND workout_id IN (
            SELECT id
            FROM workouts
            WHERE user_key = ?
          )
        `,
        userKey,
        userKey
      );

      console.log(
        "ACCOUNT SETUP: Old local data assigned to:",
        userKey
      );
    } catch (error) {
      console.log(
        "ACCOUNT SETUP ERROR:",
        error
      );
    }
  }, [db, userKey]);

  /*
   * =========================================================
   * LOAD LOCAL ROUTINES
   * =========================================================
   */
  const load = useCallback(async () => {
    if (!userKey) {
      setRoutines([]);
      return;
    }

    try {
      const rows =
        await db.getAllAsync<{
          id: number;
          name: string;
          server_id: number | null;
          created_at: string | null;
        }>(
          `
          SELECT
            id,
            name,
            server_id,
            created_at
          FROM routines
          WHERE user_key = ?
          ORDER BY id DESC
          `,
          userKey
        );

      const full: Routine[] = [];

      for (const r of rows) {
        const ex =
          await db.getAllAsync<{
            exercise: string;
          }>(
            `
            SELECT exercise
            FROM routine_exercises
            WHERE routine_id = ?
              AND user_key = ?
            ORDER BY position
            `,
            r.id,
            userKey
          );

        full.push({
          id: r.id,
          name: r.name,
          server_id: r.server_id,
          created_at: r.created_at,
          exercises: ex
            .map((e) => e.exercise)
            .join(", "),
        });
      }

      setRoutines(full);
    } catch (error) {
      console.log(
        "LOAD ROUTINES ERROR:",
        error
      );
    }
  }, [db, userKey]);

  /*
   * =========================================================
   * DOWNLOAD ROUTINES FROM DJANGO
   * =========================================================
   */
  const syncRoutinesFromBackend =
    useCallback(async () => {
      if (!token || !userKey) {
        console.log(
          "ROUTINE SYNC: No token/userKey found"
        );
        return;
      }

      try {
        console.log(
          "ROUTINE SYNC: Downloading routines from Django..."
        );

        const backendRoutines =
          (await apiFetch(
            "/api/routines/",
            {
              method: "GET",
            },
            token
          )) as BackendRoutine[];

        console.log(
          "ROUTINE SYNC: Django returned",
          backendRoutines.length,
          "routine(s)"
        );

        let importedCount = 0;

        for (const backendRoutine of backendRoutines) {
          const existing =
            await db.getFirstAsync<{
              id: number;
              server_id: number | null;
            }>(
              `
              SELECT
                id,
                server_id
              FROM routines
              WHERE server_id = ?
                AND user_key = ?
              LIMIT 1
              `,
              backendRoutine.id,
              userKey
            );

          if (existing) {
            console.log(
              "ROUTINE SYNC: Already exists locally:",
              backendRoutine.id
            );

            continue;
          }

          const result =
            await db.runAsync(
              `
              INSERT INTO routines
              (
                name,
                server_id,
                created_at,
                user_key
              )
              VALUES (?, ?, ?, ?)
              `,
              backendRoutine.name,
              backendRoutine.id,
              new Date().toISOString(),
              userKey
            );

          const localRoutineId =
            result.lastInsertRowId;

          for (
            const backendExercise of backendRoutine.exercises
          ) {
            await db.runAsync(
              `
              INSERT INTO routine_exercises
              (
                routine_id,
                exercise,
                position,
                user_key
              )
              VALUES (?, ?, ?, ?)
              `,
              localRoutineId,
              backendExercise.exercise,
              backendExercise.position,
              userKey
            );
          }

          importedCount++;

          console.log(
            "ROUTINE SYNC: Imported routine:",
            backendRoutine.id,
            backendRoutine.name
          );
        }

        console.log(
          "ROUTINE SYNC COMPLETE:",
          importedCount,
          "new routine(s) imported"
        );
      } catch (error) {
        console.log(
          "ROUTINE DOWNLOAD SYNC ERROR:",
          error
        );
      }
    }, [db, token, userKey]);

  /*
   * =========================================================
   * DOWNLOAD WORKOUTS FROM DJANGO
   * =========================================================
   */
  const syncWorkoutsFromBackend =
    useCallback(async () => {
      if (!token || !userKey) {
        console.log(
          "SYNC: No token/userKey found"
        );
        return;
      }

      try {
        console.log(
          "SYNC: Downloading workouts from Django..."
        );

        const backendWorkouts =
          (await apiFetch(
            "/api/workouts/",
            {
              method: "GET",
            },
            token
          )) as BackendWorkout[];

        console.log(
          "SYNC: Django returned",
          backendWorkouts.length,
          "workout(s)"
        );

        let importedCount = 0;

        for (const backendWorkout of backendWorkouts) {
          const existing =
            await db.getFirstAsync<{
              id: number;
              server_id: number | null;
            }>(
              `
              SELECT
                id,
                server_id
              FROM workouts
              WHERE server_id = ?
                AND user_key = ?
              LIMIT 1
              `,
              backendWorkout.id,
              userKey
            );

          if (existing) {
            console.log(
              "SYNC: Already exists locally:",
              backendWorkout.id
            );

            continue;
          }

          const result =
            await db.runAsync(
              `
              INSERT INTO workouts
              (
                routine_id,
                name,
                started_at,
                ended_at,
                server_id,
                synced,
                user_key
              )
              VALUES (?, ?, ?, ?, ?, ?, ?)
              `,
              null,
              backendWorkout.name,
              backendWorkout.started_at,
              backendWorkout.ended_at,
              backendWorkout.id,
              1,
              userKey
            );

          const localWorkoutId =
            result.lastInsertRowId;

          for (
            const backendSet of backendWorkout.sets
          ) {
            await db.runAsync(
              `
              INSERT INTO sets
              (
                exercise,
                weight,
                reps,
                created_at,
                workout_id,
                user_key
              )
              VALUES (?, ?, ?, ?, ?, ?)
              `,
              backendSet.exercise,
              backendSet.weight,
              backendSet.reps,
              backendSet.created_at,
              localWorkoutId,
              userKey
            );
          }

          importedCount++;

          console.log(
            "SYNC: Imported workout:",
            backendWorkout.id,
            backendWorkout.name
          );
        }

        console.log(
          "SYNC COMPLETE:",
          importedCount,
          "new workout(s) imported"
        );
      } catch (error) {
        console.log(
          "WORKOUT DOWNLOAD SYNC ERROR:",
          error
        );
      }
    }, [db, token, userKey]);

  /*
   * =========================================================
   * WHEN WORKOUT SCREEN OPENS
   * =========================================================
   */
  useFocusEffect(
    useCallback(() => {
      console.log(
        "🔥 WORKOUT SCREEN FOCUSED"
      );

      console.log(
        "🔥 TOKEN EXISTS:",
        !!token
      );

      console.log(
        "🔥 CURRENT USER:",
        userKey
      );

      /*
       * FIRST:
       * Assign old NULL records to the
       * currently logged-in account.
       */
      const runSync = async () => {
        if (!token || !userKey) {
          return;
        }

        await claimOldLocalData();
        await syncRoutinesFromBackend();
        await syncWorkoutsFromBackend();
        await load();
      };

      runSync();
    }, [
      token,
      userKey,
      claimOldLocalData,
      syncRoutinesFromBackend,
      syncWorkoutsFromBackend,
      load,
    ])
  );

  /*
   * =========================================================
   * TEST DJANGO BACKEND
   * =========================================================
   */
  const testBackend = async () => {
    if (!token) {
      Alert.alert(
        "Error",
        "No login token found."
      );

      return;
    }

    try {
      const data =
        await apiFetch(
          "/api/workouts/",
          {},
          token
        );

      console.log(
        "BACKEND WORKOUTS:",
        data
      );

      Alert.alert(
        "Backend Connected!",
        `Found ${data.length} workout(s).`
      );
    } catch (error) {
      console.log(
        "BACKEND ERROR:",
        error
      );

      Alert.alert(
        "Backend Error",
        String(error)
      );
    }
  };

  /*
   * =========================================================
   * DELETE ROUTINE
   * =========================================================
   */
  const confirmDelete = (
    routine: Routine
  ) => {
    Alert.alert(
      "Delete routine?",
      routine.name,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",

          onPress: async () => {
            try {
              /*
               * DELETE FROM DJANGO
               */
              if (
                token &&
                routine.server_id !== null
              ) {
                console.log(
                  "ROUTINE SYNC: Deleting routine from Django..."
                );

                const result =
                  await apiFetch(
                    `/api/routines/${routine.server_id}/`,
                    {
                      method: "DELETE",
                    },
                    token
                  );

                console.log(
                  "BACKEND ROUTINE DELETED:",
                  result
                );
              } else {
                console.log(
                  "ROUTINE SYNC: No server ID, deleting locally only."
                );
              }

              /*
               * DELETE EXERCISES LOCALLY
               */
              await db.runAsync(
                `
                DELETE FROM routine_exercises
                WHERE routine_id = ?
                  AND user_key = ?
                `,
                routine.id,
                userKey
              );

              /*
               * DELETE ROUTINE LOCALLY
               */
              await db.runAsync(
                `
                DELETE FROM routines
                WHERE id = ?
                  AND user_key = ?
                `,
                routine.id,
                userKey
              );

              console.log(
                "ROUTINE LOCAL DELETED"
              );

              await load();
            } catch (error) {
              console.log(
                "DELETE ROUTINE ERROR:",
                error
              );

              Alert.alert(
                "Error",
                "Could not delete routine."
              );
            }
          },
        },
      ]
    );
  };

  /*
   * =========================================================
   * OPEN HISTORY
   * =========================================================
   */
  const openHistory = (
    routine: Routine
  ) => {
    router.push({
      pathname: "/history",
      params: {
        routineId:
          String(routine.id),
      },
    });
  };

  /*
   * =========================================================
   * EDIT ROUTINE
   * =========================================================
   */
  const editRoutine = (
    routine: Routine
  ) => {
    router.push({
      pathname: "/edit-routine",
      params: {
        routineId:
          String(routine.id),
      },
    });
  };

  return (
    <ScrollView
      style={[
        styles.container,
        {
          backgroundColor:
            colors.background,
        },
      ]}
      contentContainerStyle={{
        padding: 16,
        paddingBottom: 120,
      }}
    >
      {/* START EMPTY WORKOUT */}
      <Pressable
        style={[
          styles.bigRow,
          {
            backgroundColor:
              colors.row,
          },
        ]}
        onPress={() =>
          router.push("/session")
        }
      >
        <Ionicons
          name="add"
          size={26}
          color={colors.icon}
        />

        <Text
          style={[
            styles.bigRowText,
            {
              color:
                colors.primaryText,
            },
          ]}
        >
          Start Empty Workout
        </Text>
      </Pressable>

      {/* WORKOUT HISTORY */}
      <Pressable
        style={[
          styles.bigRow,
          {
            backgroundColor:
              colors.row,
          },
        ]}
        onPress={() =>
          router.push("/history")
        }
      >
        <Ionicons
          name="time-outline"
          size={22}
          color={colors.icon}
        />

        <Text
          style={[
            styles.bigRowText,
            {
              color:
                colors.primaryText,
            },
          ]}
        >
          Workout History
        </Text>
      </Pressable>

      {/* ROUTINES */}
      <Text
        style={[
          styles.sectionTitle,
          {
            color:
              colors.primaryText,
          },
        ]}
      >
        Routines
      </Text>

      <Pressable
        style={[
          styles.bigRow,
          {
            backgroundColor:
              colors.row,
          },
        ]}
        onPress={() =>
          router.push("/new-routine")
        }
      >
        <Ionicons
          name="clipboard-outline"
          size={22}
          color={colors.icon}
        />

        <Text
          style={[
            styles.bigRowText,
            {
              color:
                colors.primaryText,
            },
          ]}
        >
          New Routine
        </Text>
      </Pressable>

      {/* COUNT */}
      <Text
        style={[
          styles.count,
          {
            color:
              colors.secondaryText,
          },
        ]}
      >
        My Routines ({routines.length})
      </Text>

      {/* EMPTY */}
      {routines.length === 0 && (
        <Text
          style={[
            styles.empty,
            {
              color:
                colors.secondaryText,
            },
          ]}
        >
          No routines yet. Create your Upper
          Day or Lower Day!
        </Text>
      )}

      {/* ROUTINE CARDS */}
      {routines.map((r) => (
        <View
          key={r.id}
          style={[
            styles.card,
            {
              backgroundColor:
                colors.card,
              borderColor:
                colors.border,
            },
          ]}
        >
          {/* HEADER */}
          <View
            style={styles.cardHeader}
          >
            <Text
              style={[
                styles.cardTitle,
                {
                  color:
                    colors.primaryText,
                },
              ]}
            >
              {r.name.toUpperCase()}
            </Text>

            <Pressable
              onPress={() =>
                Alert.alert(
                  r.name,
                  "What would you like to do?",
                  [
                    {
                      text: "History",
                      onPress: () =>
                        openHistory(r),
                    },
                    {
                      text: "Edit Routine",
                      onPress: () =>
                        editRoutine(r),
                    },
                    {
                      text: "Delete",
                      style:
                        "destructive",
                      onPress: () =>
                        confirmDelete(r),
                    },
                    {
                      text: "Cancel",
                      style:
                        "cancel",
                    },
                  ]
                )
              }
              hitSlop={12}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={22}
                color={
                  colors.secondaryText
                }
              />
            </Pressable>
          </View>

          {/* CREATED DATE */}
          <Text
            style={[
              styles.createdAt,
              {
                color:
                  colors.mutedText,
              },
            ]}
          >
            {formatCreatedAt(
              r.created_at
            )}
          </Text>

          {/* EXERCISES */}
          <Text
            style={[
              styles.cardSub,
              {
                color:
                  colors.secondaryText,
              },
            ]}
            numberOfLines={2}
          >
            {r.exercises}
          </Text>

          {/* HISTORY BUTTON */}
          <Pressable
            style={[
              styles.historyBtn,
              {
                backgroundColor:
                  colors.secondary,
              },
            ]}
            onPress={() =>
              openHistory(r)
            }
          >
            <Ionicons
              name="time-outline"
              size={18}
              color={colors.icon}
            />

            <Text
              style={[
                styles.historyText,
                {
                  color:
                    colors.primaryText,
                },
              ]}
            >
              History
            </Text>
          </Pressable>

          {/* START BUTTON */}
          <Pressable
            style={[
              styles.startBtn,
              {
                backgroundColor:
                  colors.green,
              },
            ]}
            onPress={() =>
              router.push({
                pathname:
                  "/session",
                params: {
                  routineId:
                    String(r.id),
                },
              })
            }
          >
            <Text
              style={styles.startText}
            >
              Start Routine
            </Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
    },

    bigRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 12,
      padding: 16,
      borderRadius: 14,
      marginBottom: 12,
    },

    bigRowText: {
      fontSize: 16,
      fontWeight:
        "600",
    },

    sectionTitle: {
      fontSize: 20,
      fontWeight:
        "700",
      marginTop: 12,
      marginBottom: 12,
    },

    count: {
      marginTop: 8,
      marginBottom: 12,
    },

    empty: {
      textAlign: "center",
      marginTop: 16,
    },

    card: {
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      marginBottom: 14,
    },

    cardHeader: {
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      alignItems:
        "center",
    },

    cardTitle: {
      fontSize: 18,
      fontWeight:
        "800",
      flex: 1,
      marginRight: 10,
    },

    createdAt: {
      fontSize: 12,
      marginTop: 5,
      marginBottom: 2,
    },

    cardSub: {
      marginTop: 6,
      marginBottom: 14,
      lineHeight: 20,
    },

    historyBtn: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 8,
      paddingVertical: 13,
      borderRadius: 14,
      marginBottom: 10,
    },

    historyText: {
      fontWeight:
        "700",
      fontSize: 15,
    },

    startBtn: {
      paddingVertical: 14,
      borderRadius: 14,
      alignItems:
        "center",
    },

    startText: {
      color: "#000",
      fontWeight:
        "700",
      fontSize: 16,
    },

    loginTestButton: {
      paddingVertical: 14,
      borderRadius: 14,
      alignItems:
        "center",
      marginBottom: 12,
    },

    loginTestText: {
      color: "#fff",
      fontSize: 16,
      fontWeight:
        "700",
    },
  });