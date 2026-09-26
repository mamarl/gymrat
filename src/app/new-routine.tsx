import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiFetch } from "../api/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function NewRoutine() {
  const db = useSQLiteContext();
 const { token, userKey } = useAuth();
  const { isDark } = useTheme();

  const colors = isDark
    ? {
        background: "#0b0b0c",
        surface: "#1c1c1e",
        border: "#2a2a2c",
        text: "#fff",
        muted: "#8a8a8e",
        primary: "#22c55e",
        primaryText: "#000",
        placeholder: "#888",
      }
    : {
        background: "#f5f5f7",
        surface: "#ffffff",
        border: "#d7d7dc",
        text: "#111114",
        muted: "#66666d",
        primary: "#16a34a",
        primaryText: "#fff",
        placeholder: "#888",
      };

  const styles = createStyles(colors);

  const [name, setName] = useState("");
  const [exercise, setExercise] = useState("");
  const [exercises, setExercises] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const addExercise = () => {
    const ex = exercise.trim();

    if (!ex) {
      return;
    }

    setExercises((prev) => [...prev, ex]);
    setExercise("");
  };

  const removeExercise = (index: number) => {
    setExercises((prev) =>
      prev.filter((_, i) => i !== index)
    );
  };

  const save = async () => {
    const routineName = name.trim();

    if (!routineName || exercises.length === 0) {
      Alert.alert(
        "Missing information",
        "Please enter a routine name and add at least one exercise."
      );
      return;
    }

    if (!token || !userKey) {
  Alert.alert(
    "Not logged in",
    "Please log in before creating a routine."
  );
  return;
}

    if (saving) {
      return;
    }

    setSaving(true);

    try {
      /*
       * =========================
       * 1. CREATE DATE/TIME
       * =========================
       */

      const createdAt = new Date().toISOString();

      /*
       * =========================
       * 2. SAVE LOCALLY FIRST
       * =========================
       */

      const localResult = await db.runAsync(
  `
  INSERT INTO routines (
    name,
    created_at,
    user_key
  )
  VALUES (?, ?, ?)
  `,
  routineName,
  createdAt,
  userKey
);

      const localRoutineId =
        localResult.lastInsertRowId;

      for (let i = 0; i < exercises.length; i++) {
        await db.runAsync(
  `INSERT INTO routine_exercises
   (routine_id, exercise, position, user_key)
   VALUES (?, ?, ?, ?)`,
  localRoutineId,
  exercises[i],
  i,
  userKey
);
      }

      console.log(
        "ROUTINE LOCAL CREATED:",
        localRoutineId,
        createdAt
      );

      /*
       * =========================
       * 3. CREATE ON DJANGO
       * =========================
       */

      console.log(
        "ROUTINE SYNC: Creating routine on Django..."
      );

      const backendRoutine =
        await apiFetch(
          "/api/routines/",
          {
            method: "POST",
            body: JSON.stringify({
              name: routineName,
            }),
          },
          token
        );

      console.log(
        "BACKEND ROUTINE CREATED:",
        backendRoutine
      );

      const serverRoutineId =
        backendRoutine.id;

      /*
       * =========================
       * 4. SAVE SERVER ID LOCALLY
       * =========================
       */

     await db.runAsync(
  `UPDATE routines
   SET server_id = ?
   WHERE id = ?
     AND user_key = ?`,
  serverRoutineId,
  localRoutineId,
  userKey
);

      console.log(
        "ROUTINE SERVER ID SAVED:",
        serverRoutineId
      );

      /*
       * =========================
       * 5. SEND EXERCISES
       * =========================
       */

      for (let i = 0; i < exercises.length; i++) {
        const backendExercise =
          await apiFetch(
            `/api/routines/${serverRoutineId}/exercises/`,
            {
              method: "POST",
              body: JSON.stringify({
                exercise: exercises[i],
                position: i,
              }),
            },
            token
          );

        console.log(
          "BACKEND ROUTINE EXERCISE CREATED:",
          backendExercise
        );
      }

      console.log(
        "ROUTINE SYNC COMPLETE:",
        routineName
      );

      Alert.alert(
        "Routine Saved",
        "Your routine was saved locally and synced to your account.",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.log(
        "ROUTINE SAVE/SYNC ERROR:",
        error
      );

      Alert.alert(
        "Routine saved locally",
        "The routine was saved on this device, but it could not be synced to the server."
      );

      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "New Routine",
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      <TextInput
        style={styles.input}
        placeholder="Routine name (e.g. Upper Day)"
        placeholderTextColor={colors.placeholder}
        value={name}
        onChangeText={setName}
      />

      <View style={styles.row}>
        <TextInput
          style={[
            styles.input,
            {
              flex: 1,
              marginBottom: 0,
            },
          ]}
          placeholder="Add exercise (e.g. Bench Press)"
          placeholderTextColor={colors.placeholder}
          value={exercise}
          onChangeText={setExercise}
          onSubmitEditing={addExercise}
          returnKeyType="done"
        />

        <Pressable
          style={styles.addBtn}
          onPress={addExercise}
        >
          <Ionicons
            name="add"
            size={24}
            color={colors.primaryText}
          />
        </Pressable>
      </View>

      <FlatList
        data={exercises}
        keyExtractor={(item, i) =>
          `${item}-${i}`
        }
        style={{
          marginTop: 16,
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Add the exercises for this routine.
          </Text>
        }
        renderItem={({ item, index }) => (
          <View style={styles.item}>
            <Text style={styles.itemText}>
              {index + 1}. {item}
            </Text>

            <Pressable
              onPress={() =>
                removeExercise(index)
              }
              hitSlop={10}
            >
              <Ionicons
                name="close"
                size={22}
                color={colors.muted}
              />
            </Pressable>
          </View>
        )}
      />

      <Pressable
        style={[
          styles.saveBtn,
          saving && styles.saveBtnDisabled,
        ]}
        onPress={save}
        disabled={saving}
      >
        <Text style={styles.saveText}>
          {saving
            ? "Saving..."
            : "Save Routine"}
        </Text>
      </Pressable>
    </View>
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
  placeholder: string;
}) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 16,
    },

    input: {
      backgroundColor: colors.surface,
      color: colors.text,
      padding: 14,
      borderRadius: 12,
      fontSize: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },

    row: {
      flexDirection: "row",
      gap: 10,
    },

    addBtn: {
      backgroundColor: colors.primary,
      width: 50,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },

    item: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.surface,
      padding: 14,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },

    itemText: {
      color: colors.text,
      fontSize: 16,
    },

    empty: {
      color: colors.muted,
      textAlign: "center",
      marginTop: 24,
    },

    saveBtn: {
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 14,
      alignItems: "center",
      marginTop: 12,
      marginBottom: 12,
    },

    saveBtnDisabled: {
      opacity: 0.5,
    },

    saveText: {
      color: colors.primaryText,
      fontWeight: "700",
      fontSize: 16,
    },
  });
}