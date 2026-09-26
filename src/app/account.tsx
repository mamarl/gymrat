
import {
    router,
} from "expo-router";

import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import {
    useState,
} from "react";

import {
    useAuth,
} from "../context/AuthContext";

import {
    useTheme,
} from "../context/ThemeContext";

import {
    apiFetch,
} from "../api/api";

import {
    useSQLiteContext,
} from "expo-sqlite";

export default function Account() {
  const {
    username,
    userKey,
    token,
    updateUsername,
  } = useAuth();

  const {
    isDark,
  } = useTheme();

  const db = useSQLiteContext();

  const [newUsername, setNewUsername] =
    useState(username || "");

  const [currentPassword, setCurrentPassword] =
    useState("");

  const [newPassword, setNewPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const colors = {
    background: isDark
      ? "#0b0b0c"
      : "#f5f5f5",

    card: isDark
      ? "#141416"
      : "#ffffff",

    border: isDark
      ? "#2a2a2c"
      : "#dddddd",

    text: isDark
      ? "#ffffff"
      : "#111111",

    secondary: isDark
      ? "#8a8a8e"
      : "#666666",

    input: isDark
      ? "#1c1c1f"
      : "#eeeeee",
  };

  // =====================================================
  // UPDATE LOCAL USER KEYS
  // =====================================================

  const updateLocalUserKey = async (
    oldKey: string,
    newKey: string
  ) => {
    try {
      const tables = [
        "routines",
        "routine_exercises",
        "workouts",
        "sets",
        "water_logs",
        "water_settings",
        "weight_history",
        "activity_history",
        "water_goal_history",
        "creatine_history",
      ];

      for (const table of tables) {
        await db.runAsync(
          `UPDATE ${table}
           SET user_key = ?
           WHERE user_key = ?`,
          newKey,
          oldKey
        );
      }
    } catch (error) {
      console.log(
        "Failed to update local user key:",
        error
      );

      throw error;
    }
  };

  // =====================================================
  // SAVE
  // =====================================================

  const handleSave = async () => {
    if (!token || !userKey) {
      return;
    }

    const trimmedUsername =
      newUsername.trim();

    if (!trimmedUsername) {
      Alert.alert(
        "Invalid username",
        "Username cannot be empty."
      );
      return;
    }

    const usernameChanged =
      trimmedUsername !== username;

    const passwordChanged =
      newPassword.length > 0;

    if (!usernameChanged && !passwordChanged) {
      Alert.alert(
        "Nothing to change",
        "You haven't changed anything."
      );
      return;
    }

    if (!currentPassword) {
      Alert.alert(
        "Current password required",
        "Enter your current password to save account changes."
      );
      return;
    }

    if (
      passwordChanged &&
      newPassword !== confirmPassword
    ) {
      Alert.alert(
        "Passwords don't match",
        "Make sure your new password and confirmation match."
      );
      return;
    }

    if (
      passwordChanged &&
      newPassword.length < 8
    ) {
      Alert.alert(
        "Password too short",
        "Your new password must be at least 8 characters."
      );
      return;
    }

    try {
      setSaving(true);

      const data = await apiFetch(
        "/api/account/",
        {
          method: "PATCH",
          body: JSON.stringify({
            ...(usernameChanged
              ? {
                  username:
                    trimmedUsername,
                }
              : {}),

            current_password:
              currentPassword,

            ...(passwordChanged
              ? {
                  new_password:
                    newPassword,
                }
              : {}),
          }),
        },
        token
      );

      // If username changed,
      // update local SQLite ownership first.
      if (
        usernameChanged
      ) {
        await updateLocalUserKey(
          userKey,
          trimmedUsername
        );

        await updateUsername(
          trimmedUsername
        );
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      Alert.alert(
        "Account updated",
        "Your account changes have been saved.",
        [
          {
            text: "OK",
            onPress: () =>
              router.back(),
          },
        ]
      );

    } catch (error: any) {

      if (
        error?.message ===
        "AUTH_TOKEN_INVALID"
      ) {
        return;
      }

      Alert.alert(
        "Update failed",
        error?.message ||
          "Something went wrong while updating your account."
      );

    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        {
          backgroundColor:
            colors.background,
        },
      ]}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : undefined
      }
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* HEADER */}

        <View style={styles.header}>
          <Pressable
            onPress={() =>
              router.back()
            }
          >
            <Text
              style={[
                styles.back,
                {
                  color:
                    colors.text,
                },
              ]}
            >
              ‹
            </Text>
          </Pressable>

          <Text
            style={[
              styles.title,
              {
                color:
                  colors.text,
              },
            ]}
          >
            Account
          </Text>

          <View
            style={styles.headerSpace}
          />
        </View>

        {/* USERNAME */}

        <Text
          style={[
            styles.sectionTitle,
            {
              color:
                colors.text,
            },
          ]}
        >
          Username
        </Text>

        <View
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
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor:
                  colors.input,
                color:
                  colors.text,
              },
            ]}
            value={newUsername}
            onChangeText={
              setNewUsername
            }
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Username"
            placeholderTextColor={
              colors.secondary
            }
          />
        </View>

        {/* PASSWORD */}

        <Text
          style={[
            styles.sectionTitle,
            {
              color:
                colors.text,
            },
          ]}
        >
          Change Password
        </Text>

        <View
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
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor:
                  colors.input,
                color:
                  colors.text,
              },
            ]}
            value={
              currentPassword
            }
            onChangeText={
              setCurrentPassword
            }
            placeholder="Current password"
            placeholderTextColor={
              colors.secondary
            }
            secureTextEntry
            autoCapitalize="none"
          />

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor:
                  colors.input,
                color:
                  colors.text,
              },
            ]}
            value={newPassword}
            onChangeText={
              setNewPassword
            }
            placeholder="New password"
            placeholderTextColor={
              colors.secondary
            }
            secureTextEntry
            autoCapitalize="none"
          />

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor:
                  colors.input,
                color:
                  colors.text,
              },
            ]}
            value={
              confirmPassword
            }
            onChangeText={
              setConfirmPassword
            }
            placeholder="Confirm new password"
            placeholderTextColor={
              colors.secondary
            }
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        <Text
          style={[
            styles.help,
            {
              color:
                colors.secondary,
            },
          ]}
        >
          Leave the new password fields empty
          if you only want to change your username.
        </Text>

        {/* SAVE */}

        <Pressable
          style={[
            styles.saveButton,
            saving &&
              styles.disabledButton,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator
              color="#000"
            />
          ) : (
            <Text
              style={styles.saveText}
            >
              Save Changes
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  content: {
    padding: 16,
    paddingBottom: 60,
  },

  header: {
    height: 55,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  back: {
    fontSize: 38,
    fontWeight: "300",
    width: 40,
  },

  title: {
    fontSize: 22,
    fontWeight: "700",
  },

  headerSpace: {
    width: 40,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 10,
  },

  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },

  input: {
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 15,
    fontSize: 15,
    marginBottom: 12,
  },

  help: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 24,
  },

  saveButton: {
    backgroundColor: "#22c55e",
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  disabledButton: {
    opacity: 0.6,
  },

  saveText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "800",
  },
});

