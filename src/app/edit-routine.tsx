import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiFetch } from "../api/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

type Exercise = {
  id: number;
  exercise: string;
  position: number;
};

export default function EditRoutine() {
  const db = useSQLiteContext();
  const { token, userKey } = useAuth();
  const { isDark } = useTheme();

  const { routineId: routineIdParam } = useLocalSearchParams<{
    routineId: string;
  }>();

  const routineId = Number(routineIdParam);

  const colors = isDark
    ? {
        background: "#0b0b0c",
        surface: "#18181b",
        border: "#27272a",
        text: "#fff",
        muted: "#777",
        primary: "#22c55e",
        primaryText: "#000",
        danger: "#ef4444",
      }
    : {
        background: "#f5f5f7",
        surface: "#ffffff",
        border: "#d7d7dc",
        text: "#111114",
        muted: "#77777e",
        primary: "#16a34a",
        primaryText: "#fff",
        danger: "#ef4444",
      };

  const styles = createStyles(colors);

  const [routineName, setRoutineName] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [newExercise, setNewExercise] = useState("");
  const [serverId, setServerId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userKey) return;

    loadRoutine();
  }, [userKey]);

  async function loadRoutine() {
    if (!userKey) return;

    try {
      const routine = await db.getFirstAsync<{
        id: number;
        name: string;
        server_id: number | null;
      }>(
        `
        SELECT id, name, server_id
        FROM routines
        WHERE id = ?
          AND user_key = ?
        `,
        routineId,
        userKey
      );

      if (!routine) {
        Alert.alert(
          "Error",
          "Routine not found or does not belong to this account."
        );
        router.back();
        return;
      }

      setRoutineName(routine.name);
      setServerId(routine.server_id);

      const rows = await db.getAllAsync<Exercise>(
        `
        SELECT id, exercise, position
        FROM routine_exercises
        WHERE routine_id = ?
          AND user_key = ?
        ORDER BY position
        `,
        routineId,
        userKey
      );

      setExercises(rows);
    } catch (error) {
      console.error("LOAD ROUTINE ERROR:", error);
      Alert.alert("Error", "Failed to load routine.");
    }
  }

  function addExercise() {
    const name = newExercise.trim();

    if (!name) return;

    const exercise: Exercise = {
      id: Date.now(),
      exercise: name,
      position: exercises.length,
    };

    setExercises((current) => [...current, exercise]);
    setNewExercise("");
  }

  function removeExercise(id: number) {
    setExercises((current) =>
      current
        .filter((item) => item.id !== id)
        .map((item, index) => ({
          ...item,
          position: index,
        }))
    );
  }

  async function saveRoutine() {
  if (!userKey) {
    Alert.alert("Error", "You are not logged in.");
    return;
  }

  const name = routineName.trim();

  if (!name) {
    Alert.alert("Error", "Please enter a routine name.");
    return;
  }

  if (saving) return;

  setSaving(true);

  try {
    // =========================
    // VERIFY LOCAL OWNERSHIP
    // =========================

    const routine = await db.getFirstAsync<{
      id: number;
      server_id: number | null;
    }>(
      `
      SELECT id, server_id
      FROM routines
      WHERE id = ?
        AND user_key = ?
      `,
      routineId,
      userKey
    );

    if (!routine) {
      Alert.alert(
        "Error",
        "This routine does not belong to your account."
      );
      return;
    }

    // Always use the server_id from the database
    // instead of the old React state value.
    const currentServerId = routine.server_id;

    // =========================
    // SAVE LOCALLY
    // =========================

    await db.runAsync(
      `
      UPDATE routines
      SET name = ?
      WHERE id = ?
        AND user_key = ?
      `,
      name,
      routineId,
      userKey
    );

    await db.runAsync(
      `
      DELETE FROM routine_exercises
      WHERE routine_id = ?
        AND user_key = ?
      `,
      routineId,
      userKey
    );

    for (let i = 0; i < exercises.length; i++) {
      await db.runAsync(
        `
        INSERT INTO routine_exercises
        (routine_id, exercise, position, user_key)
        VALUES (?, ?, ?, ?)
        `,
        routineId,
        exercises[i].exercise,
        i,
        userKey
      );
    }

    console.log("ROUTINE LOCAL UPDATED");

    // =========================
    // SYNC TO DJANGO
    // =========================

    if (token && currentServerId) {
      console.log(
        "ROUTINE SYNC: Updating routine on Django..."
      );

      const updatedRoutine = await apiFetch(
        `/api/routines/${currentServerId}/`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
          }),
        },
        token
      );

      console.log(
        "BACKEND ROUTINE UPDATED:",
        updatedRoutine
      );

      console.log(
        "ROUTINE SYNC: Updating exercises on Django..."
      );

      await apiFetch(
        `/api/routines/${currentServerId}/exercises/`,
        {
          method: "DELETE",
        },
        token
      );

      for (let i = 0; i < exercises.length; i++) {
        const createdExercise = await apiFetch(
          `/api/routines/${currentServerId}/exercises/`,
          {
            method: "POST",
            body: JSON.stringify({
              exercise: exercises[i].exercise,
              position: i,
            }),
          },
          token
        );

        console.log(
          "BACKEND ROUTINE EXERCISE CREATED:",
          createdExercise
        );
      }

      console.log(
        "ROUTINE UPDATE SYNC COMPLETE"
      );
    }

    Alert.alert(
      "Success",
      "Routine updated successfully.",
      [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]
    );
  } catch (error) {
    console.error(
      "ROUTINE UPDATE SYNC ERROR:",
      error
    );

    Alert.alert(
      "Saved locally",
      "Your routine was saved on this device, but syncing with Django failed.",
      [
        {
          text: "OK",
          onPress: () => router.back(),
        },
      ]
    );
  } finally {
    setSaving(false);
  }
}

  return (
    <>
      <Stack.Screen
        options={{
          title: "Edit Routine",
          headerBackTitle: "Back",
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <View style={styles.content}>
          <Text style={styles.label}>
            Routine Name
          </Text>

          <TextInput
            value={routineName}
            onChangeText={setRoutineName}
            placeholder="Routine name"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.label}>
            Exercises
          </Text>

          <FlatList
            data={exercises}
            keyExtractor={(item) =>
              String(item.id)
            }
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.exerciseRow}>
                <Text style={styles.exerciseText}>
                  {item.position + 1}.{" "}
                  {item.exercise}
                </Text>

                <Pressable
                  onPress={() =>
                    removeExercise(item.id)
                  }
                  style={styles.deleteButton}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={colors.danger}
                  />
                </Pressable>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No exercises yet.
              </Text>
            }
          />

          <View style={styles.addRow}>
            <TextInput
              value={newExercise}
              onChangeText={setNewExercise}
              placeholder="Add exercise"
              placeholderTextColor={colors.muted}
              style={[
                styles.input,
                styles.addInput,
              ]}
              onSubmitEditing={addExercise}
              returnKeyType="done"
            />

            <Pressable
              onPress={addExercise}
              style={styles.addButton}
            >
              <Ionicons
                name="add"
                size={24}
                color={colors.primaryText}
              />
            </Pressable>
          </View>

          <Pressable
            onPress={saveRoutine}
            disabled={saving}
            style={[
              styles.saveButton,
              saving &&
                styles.saveButtonDisabled,
            ]}
          >
            <Text style={styles.saveText}>
              {saving
                ? "Saving..."
                : "Save Changes"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

function createStyles(colors: {
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  primaryText: string;
  danger: string;
}) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    content: {
      flex: 1,
      padding: 20,
    },

    label: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
      marginBottom: 8,
      marginTop: 8,
    },

    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 16,
    },

    list: {
      paddingTop: 8,
      paddingBottom: 12,
    },

    exerciseRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },

    exerciseText: {
      flex: 1,
      color: colors.text,
      fontSize: 16,
    },

    deleteButton: {
      padding: 4,
    },

    emptyText: {
      color: colors.muted,
      textAlign: "center",
      paddingVertical: 20,
    },

    addRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    addInput: {
      flex: 1,
    },

    addButton: {
      width: 48,
      height: 48,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },

    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 15,
      alignItems: "center",
      marginTop: 16,
    },

    saveButtonDisabled: {
      opacity: 0.5,
    },

    saveText: {
      color: colors.primaryText,
      fontSize: 16,
      fontWeight: "700",
    },
  });
}