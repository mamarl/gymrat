import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "../api/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

type SetRow = {
  id: number;
  exercise: string;
  weight: number;
  reps: number;
  created_at: string;
};

type PrevSet = {
  weight: number;
  reps: number;
};

type Prev = {
  date: string;
  sets: PrevSet[];
};

const keyOf = (name: string) =>
  name.trim().toLowerCase();

export default function Session() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  const { token, userKey } = useAuth();
  const { isDark } = useTheme();

  const { routineId } =
    useLocalSearchParams<{
      routineId?: string;
    }>();

  const colors = isDark
    ? {
        background: "#0b0b0c",
        surface: "#1c1c1e",
        card: "#141416",
        secondary: "#222222",
        border: "#2a2a2c",
        text: "#ffffff",
        muted: "#8a8a8e",
        subtle: "#aaaaaa",
        primary: "#22c55e",
        primaryText: "#000000",
        danger: "#ef4444",
      }
    : {
        background: "#f5f5f7",
        surface: "#ffffff",
        card: "#ffffff",
        secondary: "#eeeeef",
        border: "#d7d7dc",
        text: "#111114",
        muted: "#66666d",
        subtle: "#77777e",
        primary: "#16a34a",
        primaryText: "#ffffff",
        danger: "#ef4444",
      };

  const styles = createStyles(colors);

  const [workoutId, setWorkoutId] =
    useState<number | null>(null);

  const [routineName, setRoutineName] =
    useState("Workout");

  const [routineExercises, setRoutineExercises] =
    useState<string[]>([]);

  const [exercise, setExercise] =
    useState("");

  const [weight, setWeight] =
    useState("");

  const [reps, setReps] =
    useState("");

  const [sets, setSets] =
    useState<SetRow[]>([]);

  const [history, setHistory] =
    useState<Record<string, Prev | null>>({});

  const started = useRef(false);

  const exerciseFocused = useRef(false);

  /*
   * CLAIM OLD WORKOUT DATA
   *
   * Workouts created before account separation
   * may have user_key = NULL.
   *
   * If a workout belongs to a routine that already
   * has a user_key, assign the workout to that same
   * account.
   *
   * Then assign its sets to the same account.
   */
  const claimOldWorkoutData = useCallback(
    async () => {
      if (!userKey) {
        return;
      }

      await db.runAsync(
        `UPDATE workouts
         SET user_key = ?
         WHERE user_key IS NULL
         AND routine_id IS NOT NULL
         AND routine_id IN (
           SELECT id
           FROM routines
           WHERE user_key = ?
         )`,
        userKey,
        userKey
      );

      await db.runAsync(
        `UPDATE sets
         SET user_key = ?
         WHERE user_key IS NULL
         AND workout_id IN (
           SELECT id
           FROM workouts
           WHERE user_key = ?
         )`,
        userKey,
        userKey
      );
    },
    [db, userKey]
  );

  /*
   * LOAD ROUTINE
   */
  const loadRoutine = useCallback(async () => {
    if (!userKey) {
      return;
    }

    const rid = routineId
      ? Number(routineId)
      : null;

    let name = "Workout";
    let exs: string[] = [];

    if (rid !== null) {
      const r =
        await db.getFirstAsync<{
          name: string;
        }>(
          `SELECT name
           FROM routines
           WHERE id = ?
           AND user_key = ?`,
          rid,
          userKey
        );

      const ex =
        await db.getAllAsync<{
          exercise: string;
        }>(
          `SELECT exercise
           FROM routine_exercises
           WHERE routine_id = ?
           AND user_key = ?
           ORDER BY position`,
          rid,
          userKey
        );

      if (r) {
        name = r.name;
      }

      exs = ex.map(
        (item) => item.exercise
      );
    }

    setRoutineName(name);
    setRoutineExercises(exs);

    if (
      exs.length > 0 &&
      !exerciseFocused.current
    ) {
      setExercise((current) => {
        if (current.trim()) {
          return current;
        }

        return exs[0];
      });
    }
  }, [db, routineId, userKey]);

  /*
   * START / RESUME WORKOUT
   */
  useEffect(() => {
    if (
      started.current ||
      !userKey
    ) {
      return;
    }

    started.current = true;

    (async () => {
      await claimOldWorkoutData();

      const rid = routineId
        ? Number(routineId)
        : null;

      let name = "Workout";

      if (rid !== null) {
        const r =
          await db.getFirstAsync<{
            name: string;
          }>(
            `SELECT name
             FROM routines
             WHERE id = ?
             AND user_key = ?`,
            rid,
            userKey
          );

        if (r) {
          name = r.name;
        }
      }

      /*
       * Only look for an open workout belonging
       * to the current account.
       */
      const open =
        await db.getFirstAsync<{
          id: number;
        }>(
          `SELECT id
           FROM workouts
           WHERE ended_at IS NULL
           AND routine_id IS ?
           AND user_key = ?
           ORDER BY id DESC
           LIMIT 1`,
          rid,
          userKey
        );

      let id: number;

      if (open) {
        id = open.id;
      } else {
        const result =
          await db.runAsync(
            `INSERT INTO workouts
             (
               routine_id,
               name,
               user_key
             )
             VALUES (?, ?, ?)`,
            rid,
            name,
            userKey
          );

        id =
          result.lastInsertRowId;
      }

      /*
       * Close other open workouts ONLY for
       * the current account.
       */
      await db.runAsync(
        `UPDATE workouts
         SET ended_at =
           datetime(
             'now',
             'localtime'
           )
         WHERE ended_at IS NULL
         AND id != ?
         AND user_key = ?`,
        id,
        userKey
      );

      setWorkoutId(id);

      await loadRoutine();
    })();
  }, [
    db,
    routineId,
    userKey,
    loadRoutine,
    claimOldWorkoutData,
  ]);

  /*
   * REFRESH ROUTINE AFTER RETURNING
   * FROM EDIT ROUTINE
   */
  useFocusEffect(
    useCallback(() => {
      if (!started.current) {
        return;
      }

      if (!exerciseFocused.current) {
        loadRoutine();
      }
    }, [loadRoutine])
  );

  /*
   * LOAD SETS
   */
  const loadSets = useCallback(
    async () => {
      if (
        workoutId === null ||
        !userKey
      ) {
        return;
      }

      const rows =
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
           ORDER BY id DESC`,
          workoutId,
          userKey
        );

      setSets(rows);
    },
    [db, workoutId, userKey]
  );

  useEffect(() => {
    loadSets();
  }, [loadSets]);

  /*
   * LOAD PREVIOUS WORKOUT DATA
   *
   * IMPORTANT:
   * Only search previous workouts belonging
   * to the current account.
   */
  const fetchPrevious = useCallback(
    async (
      name: string,
      currentId: number
    ): Promise<Prev | null> => {
      if (!userKey) {
        return null;
      }

      const previousWorkout =
        await db.getFirstAsync<{
          id: number;
          started_at: string;
        }>(
          `SELECT
             w.id,
             w.started_at
           FROM workouts w
           WHERE w.ended_at IS NOT NULL
           AND w.id != ?
           AND w.user_key = ?
           AND EXISTS (
             SELECT 1
             FROM sets s
             WHERE s.workout_id = w.id
             AND s.user_key = ?
             AND s.exercise = ?
             COLLATE NOCASE
           )
           ORDER BY w.id DESC
           LIMIT 1`,
          currentId,
          userKey,
          userKey,
          name.trim()
        );

      if (!previousWorkout) {
        return null;
      }

      const previousSets =
        await db.getAllAsync<PrevSet>(
          `SELECT
             weight,
             reps
           FROM sets
           WHERE workout_id = ?
           AND user_key = ?
           AND exercise = ?
           COLLATE NOCASE
           ORDER BY id`,
          previousWorkout.id,
          userKey,
          name.trim()
        );

      return {
        date:
          previousWorkout.started_at.slice(
            0,
            10
          ),
        sets: previousSets,
      };
    },
    [db, userKey]
  );

  /*
   * LOAD HISTORY FOR AN EXERCISE
   */
  const loadExerciseHistory = useCallback(
    async (name: string) => {
      if (
        workoutId === null ||
        !name.trim()
      ) {
        return;
      }

      const key = keyOf(name);

      if (
        Object.prototype.hasOwnProperty.call(
          history,
          key
        )
      ) {
        return;
      }

      const previous =
        await fetchPrevious(
          name,
          workoutId
        );

      setHistory((current) => ({
        ...current,
        [key]: previous,
      }));
    },
    [
      workoutId,
      history,
      fetchPrevious,
    ]
  );

  /*
   * Load history for routine exercises
   */
  useEffect(() => {
    if (
      workoutId === null ||
      routineExercises.length === 0
    ) {
      return;
    }

    let cancelled = false;

    (async () => {
      for (
        const name of routineExercises
      ) {
        const key = keyOf(name);

        if (
          Object.prototype.hasOwnProperty.call(
            history,
            key
          )
        ) {
          continue;
        }

        const previous =
          await fetchPrevious(
            name,
            workoutId
          );

        if (cancelled) {
          return;
        }

        setHistory((current) => ({
          ...current,
          [key]: previous,
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    workoutId,
    routineExercises,
    fetchPrevious,
  ]);

  /*
   * SELECT EXERCISE CHIP
   */
  const selectExercise = async (
    name: string
  ) => {
    exerciseFocused.current = false;

    setExercise(name);

    let previous =
      history[keyOf(name)];

    if (
      previous === undefined &&
      workoutId !== null
    ) {
      previous =
        await fetchPrevious(
          name,
          workoutId
        );

      setHistory((current) => ({
        ...current,
        [keyOf(name)]:
          previous ?? null,
      }));
    }

    if (
      previous &&
      previous.sets.length > 0
    ) {
      setWeight(
        String(
          previous.sets[0].weight
        )
      );
    }
  };

  /*
   * LOG SET
   */
  const logSet = async () => {
    const w =
      parseFloat(weight);

    const r =
      parseInt(reps, 10);

    if (
      workoutId === null ||
      !userKey ||
      !exercise.trim() ||
      isNaN(w) ||
      isNaN(r)
    ) {
      return;
    }

    await db.runAsync(
      `INSERT INTO sets
       (
         exercise,
         weight,
         reps,
         workout_id,
         user_key
       )
       VALUES (?, ?, ?, ?, ?)`,
      exercise.trim(),
      w,
      r,
      workoutId,
      userKey
    );

    setReps("");

    await loadSets();
  };

  /*
   * DELETE SET
   */
  const deleteSet = async (
    id: number
  ) => {
    if (!userKey) {
      return;
    }

    /*
     * The set must belong to the current
     * user's current workout.
     */
    await db.runAsync(
      `DELETE FROM sets
       WHERE id = ?
       AND workout_id = ?
       AND user_key = ?`,
      id,
      workoutId,
      userKey
    );

    await loadSets();
  };

  /*
   * TOTAL VOLUME
   */
  const volume = Math.round(
    sets.reduce(
      (sum, item) =>
        sum +
        item.weight *
          item.reps,
      0
    )
  );

  /*
   * SET NUMBER
   */
  const setNumber = (
    item: SetRow
  ) =>
    sets.filter(
      (set) =>
        keyOf(set.exercise) ===
          keyOf(
            item.exercise
          ) &&
        set.id <= item.id
    ).length;

  /*
   * COMPARE WITH PREVIOUS SET
   */
  const judge = (
    item: SetRow,
    old: PrevSet
  ):
    | "up"
    | "down"
    | "same" => {
    if (
      item.weight >
        old.weight ||
      (item.weight ===
        old.weight &&
        item.reps >
          old.reps)
    ) {
      return "up";
    }

    if (
      item.weight <
        old.weight ||
      (item.weight ===
        old.weight &&
        item.reps <
          old.reps)
    ) {
      return "down";
    }

    return "same";
  };

  /*
   * EDIT ROUTINE
   */
  const editRoutine = () => {
    if (!routineId) {
      return;
    }

    exerciseFocused.current =
      false;

    router.push({
      pathname:
        "/edit-routine",
      params: {
        routineId:
          String(routineId),
      },
    });
  };

  /*
   * SYNC WORKOUT TO DJANGO
   */
  const syncWorkoutToBackend =
    async () => {
      if (
        !token ||
        !userKey ||
        workoutId === null
      ) {
        return;
      }

      try {
        const workout =
          await db.getFirstAsync<{
            id: number;
            name: string;
            started_at: string;
            ended_at:
              | string
              | null;
            server_id:
              | number
              | null;
            synced: number;
          }>(
            `SELECT
              id,
              name,
              started_at,
              ended_at,
              server_id,
              synced
             FROM workouts
             WHERE id = ?
             AND user_key = ?`,
            workoutId,
            userKey
          );

        if (!workout) {
          return;
        }

        if (
          workout.synced === 1 &&
          workout.server_id !==
            null
        ) {
          console.log(
            "Workout already synced:",
            workout.server_id
          );

          return;
        }

        const backendWorkout =
          await apiFetch(
            "/api/workouts/",
            {
              method: "POST",
              body: JSON.stringify({
                name:
                  workout.name,
                started_at:
                  workout.started_at,
                ended_at:
                  workout.ended_at,
              }),
            },
            token
          );

        console.log(
          "BACKEND WORKOUT CREATED:",
          backendWorkout
        );

        await db.runAsync(
          `UPDATE workouts
           SET server_id = ?,
               synced = 0
           WHERE id = ?
           AND user_key = ?`,
          backendWorkout.id,
          workoutId,
          userKey
        );

        const localSets =
          await db.getAllAsync<{
            exercise: string;
            weight: number;
            reps: number;
          }>(
            `SELECT
              exercise,
              weight,
              reps
             FROM sets
             WHERE workout_id = ?
             AND user_key = ?
             ORDER BY id`,
            workoutId,
            userKey
          );

        for (
          const set of localSets
        ) {
          const backendSet =
            await apiFetch(
              `/api/workouts/${backendWorkout.id}/sets/`,
              {
                method:
                  "POST",
                body:
                  JSON.stringify({
                    exercise:
                      set.exercise,
                    weight:
                      set.weight,
                    reps:
                      set.reps,
                  }),
              },
              token
            );

          console.log(
            "BACKEND SET CREATED:",
            backendSet
          );
        }

        await db.runAsync(
          `UPDATE workouts
           SET synced = 1
           WHERE id = ?
           AND user_key = ?`,
          workoutId,
          userKey
        );

        console.log(
          "WORKOUT SYNC COMPLETE:",
          backendWorkout.id
        );
      } catch (error) {
        console.log(
          "WORKOUT SYNC ERROR:",
          error
        );

        Alert.alert(
          "Sync failed",
          "Your workout was saved locally, but it could not be uploaded to the server."
        );
      }
    };

  /*
   * END SESSION
   */
  const endSession = () => {
    if (
      workoutId === null ||
      !userKey
    ) {
      return;
    }

    if (sets.length === 0) {
      Alert.alert(
        "End session?",
        "No sets were logged, so this workout won't be saved.",
        [
          {
            text: "Keep going",
            style:
              "cancel",
          },
          {
            text: "Discard",
            style:
              "destructive",
            onPress:
              async () => {
                await db.runAsync(
                  `DELETE FROM workouts
                   WHERE id = ?
                   AND user_key = ?`,
                  workoutId,
                  userKey
                );

                router.back();
              },
          },
        ]
      );

      return;
    }

    Alert.alert(
      "End session?",
      `${sets.length} sets · ${volume} kg total volume`,
      [
        {
          text: "Keep going",
          style: "cancel",
        },
        {
          text: "End session",
          onPress:
            async () => {
              await db.runAsync(
                `UPDATE workouts
                 SET ended_at =
                   datetime(
                     'now',
                     'localtime'
                   )
                 WHERE id = ?
                 AND user_key = ?`,
                workoutId,
                userKey
              );

              await syncWorkoutToBackend();

              router.back();
            },
        },
      ]
    );
  };

  const previous =
    exercise.trim()
      ? history[
          keyOf(exercise)
        ]
      : undefined;

  const noHistory =
    exercise.trim() !== "" &&
    Object.prototype.hasOwnProperty.call(
      history,
      keyOf(exercise)
    ) &&
    history[
      keyOf(exercise)
    ] === null;

  return (
    <View
      style={styles.container}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: routineName,
          headerStyle: {
            backgroundColor:
              colors.background,
          },
          headerTintColor:
            colors.text,
          headerShadowVisible:
            false,
          headerRight: () =>
            routineId ? (
              <Pressable
                onPress={
                  editRoutine
                }
                style={
                  styles.headerEdit
                }
                hitSlop={10}
              >
                <Text
                  style={
                    styles.headerEditText
                  }
                >
                  Edit
                </Text>
              </Pressable>
            ) : null,
        }}
      />

      {/* EXERCISE CHIPS */}
      {routineExercises.length >
        0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          style={{
            flexGrow: 0,
            marginBottom: 12,
          }}
        >
          {routineExercises.map(
            (item) => (
              <Pressable
                key={item}
                style={[
                  styles.chip,
                  keyOf(
                    exercise
                  ) ===
                    keyOf(item) &&
                    styles.chipActive,
                ]}
                onPress={() =>
                  selectExercise(
                    item
                  )
                }
              >
                <Text
                  style={
                    styles.chipText
                  }
                >
                  {item}
                </Text>
              </Pressable>
            )
          )}
        </ScrollView>
      )}

      {/* PREVIOUS WORKOUT */}
      {previous && (
        <View
          style={
            styles.prevCard
          }
        >
          <Text
            style={
              styles.prevTitle
            }
          >
            Last time ·{" "}
            {previous.date}
          </Text>

          <View
            style={
              styles.prevRow
            }
          >
            {previous.sets.map(
              (item, index) => (
                <View
                  key={index}
                  style={
                    styles.prevPill
                  }
                >
                  <Text
                    style={
                      styles.prevPillText
                    }
                  >
                    {index + 1}:{" "}
                    {item.weight} kg ×{" "}
                    {item.reps}
                  </Text>
                </View>
              )
            )}
          </View>
        </View>
      )}

      {/* NO HISTORY */}
      {noHistory && (
        <Text
          style={
            styles.noPrev
          }
        >
          No previous record yet.
          This session will be
          your baseline.
        </Text>
      )}

      {/* EXERCISE INPUT */}
      <TextInput
        style={styles.input}
        placeholder="Exercise (e.g. Bench Press)"
        placeholderTextColor={
          colors.muted
        }
        value={exercise}
        onFocus={() => {
          exerciseFocused.current =
            true;
        }}
        onBlur={() => {
          exerciseFocused.current =
            false;
        }}
        onChangeText={(text) => {
          setExercise(text);
        }}
      />

      {/* WEIGHT + REPS */}
      <View
        style={styles.row}
      >
        <TextInput
          style={[
            styles.input,
            styles.half,
          ]}
          placeholder="Weight (kg)"
          placeholderTextColor={
            colors.muted
          }
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={
            setWeight
          }
        />

        <TextInput
          style={[
            styles.input,
            styles.half,
          ]}
          placeholder="Reps"
          placeholderTextColor={
            colors.muted
          }
          keyboardType="number-pad"
          value={reps}
          onChangeText={
            setReps
          }
        />
      </View>

      {/* LOG SET */}
      <Pressable
        style={styles.button}
        onPress={logSet}
      >
        <Text
          style={
            styles.buttonText
          }
        >
          Log set
        </Text>
      </Pressable>

      {/* STATS */}
      <Text
        style={styles.stats}
      >
        This workout:{" "}
        {sets.length} sets ·{" "}
        {volume} kg volume
      </Text>

      {/* SET LIST */}
      <FlatList
        data={sets}
        keyExtractor={(item) =>
          String(item.id)
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: 16,
        }}
        ListEmptyComponent={
          <Text
            style={styles.empty}
          >
            No sets yet. Log your
            first one!
          </Text>
        }
        renderItem={({
          item,
        }) => {
          const number =
            setNumber(item);

          const old =
            history[
              keyOf(
                item.exercise
              )
            ]?.sets[
              number - 1
            ];

          const result =
            old
              ? judge(
                  item,
                  old
                )
              : null;

          const resultColor =
            result === "up"
              ? colors.primary
              : result ===
                "down"
              ? colors.danger
              : colors.muted;

          return (
            <Pressable
              style={
                styles.item
              }
              onLongPress={() =>
                deleteSet(
                  item.id
                )
              }
            >
              <View
                style={{
                  flex: 1,
                }}
              >
                <Text
                  style={
                    styles.itemTitle
                  }
                >
                  {
                    item.exercise
                  }
                </Text>

                <Text
                  style={
                    styles.itemSub
                  }
                >
                  Set {number} ·{" "}
                  {item.weight} kg ×{" "}
                  {item.reps} ·{" "}
                  {item.created_at.slice(
                    11,
                    16
                  )}
                </Text>
              </View>

              {result &&
                old && (
                  <View
                    style={
                      styles.deltaBox
                    }
                  >
                    <Text
                      style={[
                        styles.delta,
                        {
                          color:
                            resultColor,
                        },
                      ]}
                    >
                      {result ===
                      "up"
                        ? "▲"
                        : result ===
                          "down"
                        ? "▼"
                        : "="}
                    </Text>

                    <Text
                      style={
                        styles.deltaSub
                      }
                    >
                      was{" "}
                      {
                        old.weight
                      }{" "}
                      ×{" "}
                      {old.reps}
                    </Text>
                  </View>
                )}
            </Pressable>
          );
        }}
      />

      {/* END SESSION */}
      <Pressable
        style={[
          styles.endBtn,
          {
            marginBottom:
              insets.bottom +
              4,
          },
        ]}
        onPress={
          endSession
        }
      >
        <Text
          style={
            styles.endText
          }
        >
          End Session
        </Text>
      </Pressable>
    </View>
  );
}

type ThemeColors = {
  background: string;
  surface: string;
  card: string;
  secondary: string;
  border: string;
  text: string;
  muted: string;
  subtle: string;
  primary: string;
  primaryText: string;
  danger: string;
};

function createStyles(
  colors: ThemeColors
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      backgroundColor:
        colors.background,
    },

    headerEdit: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },

    headerEditText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: "700",
    },

    input: {
      backgroundColor:
        colors.surface,
      color: colors.text,
      padding: 12,
      borderRadius: 10,
      marginBottom: 10,
      fontSize: 16,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    row: {
      flexDirection:
        "row",
      gap: 10,
    },

    half: {
      flex: 1,
    },

    button: {
      backgroundColor:
        colors.primary,
      padding: 14,
      borderRadius: 10,
      alignItems:
        "center",
      marginBottom: 12,
    },

    buttonText: {
      color:
        colors.primaryText,
      fontWeight: "700",
      fontSize: 16,
    },

    stats: {
      color: colors.muted,
      marginBottom: 10,
    },

    chip: {
      backgroundColor:
        colors.secondary,
      paddingHorizontal:
        14,
      paddingVertical: 8,
      borderRadius: 20,
      marginRight: 8,
    },

    chipActive: {
      backgroundColor:
        colors.primary,
    },

    chipText: {
      color: colors.text,
      fontWeight: "600",
    },

    prevCard: {
      backgroundColor:
        colors.card,
      borderWidth: 1,
      borderColor:
        colors.border,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },

    prevTitle: {
      color: colors.muted,
      fontSize: 13,
      marginBottom: 8,
    },

    prevRow: {
      flexDirection:
        "row",
      flexWrap:
        "wrap",
      gap: 8,
    },

    prevPill: {
      backgroundColor:
        colors.surface,
      paddingHorizontal:
        10,
      paddingVertical: 6,
      borderRadius: 8,
    },

    prevPillText: {
      color: colors.text,
      fontWeight: "600",
    },

    noPrev: {
      color: colors.muted,
      marginBottom: 12,
    },

    item: {
      flexDirection:
        "row",
      alignItems:
        "center",
      backgroundColor:
        colors.surface,
      padding: 12,
      borderRadius: 10,
      marginBottom: 8,
      borderWidth: 1,
      borderColor:
        colors.border,
    },

    itemTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "600",
    },

    itemSub: {
      color: colors.subtle,
      marginTop: 2,
    },

    deltaBox: {
      alignItems:
        "flex-end",
      marginLeft: 8,
    },

    delta: {
      fontSize: 18,
      fontWeight: "800",
    },

    deltaSub: {
      color: colors.muted,
      fontSize: 12,
    },

    empty: {
      color: colors.muted,
      textAlign: "center",
      marginTop: 24,
    },

    endBtn: {
      borderWidth: 1.5,
      borderColor:
        colors.danger,
      padding: 14,
      borderRadius: 12,
      alignItems: "center",
      marginTop: 8,
    },

    endText: {
      color: colors.danger,
      fontWeight: "700",
      fontSize: 16,
    },
  });
}