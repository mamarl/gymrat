import {
  router,
  useFocusEffect,
} from "expo-router";

import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

type WaterSettings = {
  weight_kg: number | null;
  activity_level: string;
  custom_goal_ml: number | null;
  taking_creatine: number;
  creatine_grams: number;
};

type WorkoutStats = {
  workouts: number;
  totalSets: number;
  streak: number;
  volume: number;
};

export default function Profile() {
  const { username, userKey, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const db = useSQLiteContext();

  const [waterSettings, setWaterSettings] =
    useState<WaterSettings | null>(null);

  const [stats, setStats] =
    useState<WorkoutStats>({
      workouts: 0,
      totalSets: 0,
      streak: 0,
      volume: 0,
    });

  /*
   * COLORS
   */
  const colors = {
    background: isDark ? "#0b0b0c" : "#f5f5f5",
    card: isDark ? "#141416" : "#ffffff",
    border: isDark ? "#2a2a2c" : "#dddddd",
    text: isDark ? "#ffffff" : "#111111",
    secondary: isDark ? "#8a8a8e" : "#666666",
    divider: isDark ? "#242426" : "#e5e5e5",
    arrow: isDark ? "#77777c" : "#888888",
  };

  /*
   * LOAD WATER SETTINGS
   */
  const loadWaterSettings = useCallback(async () => {
    try {
      const settings =
        await db.getFirstAsync<WaterSettings>(
          `
          SELECT
            weight_kg,
            activity_level,
            custom_goal_ml,
            taking_creatine,
            creatine_grams
          FROM water_settings
          WHERE id = 1
          LIMIT 1
          `
        );

      setWaterSettings(settings || null);
    } catch (error) {
      console.log(
        "PROFILE: Failed to load water settings:",
        error
      );
    }
  }, [db]);

  /*
   * LOAD WORKOUT STATISTICS
   */
  const loadWorkoutStats = useCallback(async () => {
    if (!userKey) {
      setStats({
        workouts: 0,
        totalSets: 0,
        streak: 0,
        volume: 0,
      });
      return;
    }

    try {
      const workoutResult =
        await db.getFirstAsync<{
          count: number;
        }>(
          `
          SELECT COUNT(*) as count
          FROM workouts
          WHERE ended_at IS NOT NULL
            AND user_key = ?
          `,
          userKey
        );

      const setsResult =
        await db.getFirstAsync<{
          count: number;
        }>(
          `
          SELECT COUNT(*) as count
          FROM sets
          WHERE user_key = ?
          `,
          userKey
        );

      const volumeResult =
        await db.getFirstAsync<{
          volume: number | null;
        }>(
          `
          SELECT
            COALESCE(
              SUM(weight * reps),
              0
            ) as volume
          FROM sets
          WHERE user_key = ?
          `,
          userKey
        );

      const workoutDays =
        await db.getAllAsync<{
          workout_date: string;
        }>(
          `
          SELECT DISTINCT
            date(ended_at, 'localtime') as workout_date
          FROM workouts
          WHERE ended_at IS NOT NULL
            AND user_key = ?
          ORDER BY workout_date DESC
          `,
          userKey
        );

      let streak = 0;

      if (workoutDays.length > 0) {
        const dates = workoutDays.map(
          (item) => item.workout_date
        );

        const today = new Date();

        const todayString =
          `${today.getFullYear()}-` +
          `${String(
            today.getMonth() + 1
          ).padStart(2, "0")}-` +
          `${String(
            today.getDate()
          ).padStart(2, "0")}`;

        const dateFromString = (
          dateString: string
        ) => {
          const [year, month, day] =
            dateString
              .split("-")
              .map(Number);

          return new Date(
            year,
            month - 1,
            day
          );
        };

        let currentDate =
          dateFromString(dates[0]);

        const todayDate =
          dateFromString(todayString);

        const difference =
          Math.floor(
            (todayDate.getTime() -
              currentDate.getTime()) /
              (1000 * 60 * 60 * 24)
          );

        if (
          difference === 0 ||
          difference === 1
        ) {
          streak = 1;

          for (
            let i = 1;
            i < dates.length;
            i++
          ) {
            const previousDate =
              dateFromString(
                dates[i - 1]
              );

            const nextDate =
              dateFromString(
                dates[i]
              );

            const dayDifference =
              Math.floor(
                (previousDate.getTime() -
                  nextDate.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

            if (dayDifference === 1) {
              streak++;
            } else {
              break;
            }
          }
        }
      }

      setStats({
        workouts:
          workoutResult?.count || 0,
        totalSets:
          setsResult?.count || 0,
        streak,
        volume:
          volumeResult?.volume || 0,
      });
    } catch (error) {
      console.log(
        "PROFILE: Failed to load workout statistics:",
        error
      );
    }
  }, [db, userKey]);

  /*
   * LOAD DATA
   */
  useFocusEffect(
    useCallback(() => {
      loadWaterSettings();
      loadWorkoutStats();
    }, [
      loadWaterSettings,
      loadWorkoutStats,
    ])
  );

  /*
   * WATER GOAL
   */
  const getWaterGoal = () => {
    if (!waterSettings) {
      return null;
    }

    if (
      waterSettings.custom_goal_ml !== null &&
      waterSettings.custom_goal_ml > 0
    ) {
      return waterSettings.custom_goal_ml;
    }

    if (
      waterSettings.weight_kg === null ||
      waterSettings.weight_kg <= 0
    ) {
      return null;
    }

    let goal =
      waterSettings.weight_kg * 35;

    switch (
      waterSettings.activity_level
    ) {
      case "light":
        goal += 250;
        break;

      case "moderate":
        goal += 500;
        break;

      case "very_active":
        goal += 750;
        break;

      case "sedentary":
      default:
        break;
    }

    if (
      waterSettings.taking_creatine &&
      waterSettings.creatine_grams > 0
    ) {
      goal +=
        waterSettings.creatine_grams * 125;
    }

    return Math.round(goal / 50) * 50;
  };

  /*
   * FORMAT ACTIVITY
   */
  const formatActivity = (
    activity: string
  ) => {
    switch (activity) {
      case "sedentary":
        return "Sedentary";

      case "light":
        return "Light";

      case "moderate":
        return "Moderate";

      case "very_active":
        return "Very Active";

      default:
        return activity || "—";
    }
  };

  /*
   * FORMAT VOLUME
   */
  const formatVolume = (
    volume: number
  ) => {
    if (volume >= 1000000) {
      return `${(
        volume / 1000000
      ).toFixed(1)}M`;
    }

    if (volume >= 1000) {
      return `${(
        volume / 1000
      ).toFixed(1)}k`;
    }

    return Math.round(volume).toString();
  };

  const waterGoal =
    getWaterGoal();

  /*
   * LOGOUT
   */
  const handleLogout = () => {
    Alert.alert(
      "Log out?",
      "Are you sure you want to log out?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
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
      contentContainerStyle={
        styles.content
      }
      showsVerticalScrollIndicator={
        false
      }
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Text
          style={[
            styles.title,
            { color: colors.text },
          ]}
        >
          Profile
        </Text>

        <Pressable
          style={styles.themeButton}
          onPress={toggleTheme}
        >
          <Text style={styles.themeIcon}>
            {isDark ? "☀️" : "🌙"}
          </Text>
        </Pressable>
      </View>

      {/* ACCOUNT */}
      <View
        style={[
          styles.accountCard,
          {
            backgroundColor:
              colors.card,
            borderColor:
              colors.border,
          },
        ]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(username || "U")
              .charAt(0)
              .toUpperCase()}
          </Text>
        </View>

        <View style={styles.accountInfo}>
          <Text
            style={[
              styles.label,
              {
                color:
                  colors.secondary,
              },
            ]}
          >
            Logged in as
          </Text>

          <Text
            style={[
              styles.username,
              { color: colors.text },
            ]}
          >
            {username ||
              "Unknown user"}
          </Text>
        </View>

        <Pressable
  style={styles.accountSettings}
  onPress={() =>
    router.push("/account")
  }
>
          <Text
            style={[
              styles.accountSettingsText,
              { color: colors.text },
            ]}
          >
            Account
          </Text>

          <Text
            style={[
              styles.arrow,
              { color: colors.arrow },
            ]}
          >
            ›
          </Text>
        </Pressable>
      </View>

      {/* BODY & GOALS */}
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.text },
        ]}
      >
        Body & Goals
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
        {/* WEIGHT */}
        <Pressable
          style={styles.row}
          onPress={() =>
            router.push("/weight-history")
          }
        >
          <View>
            <Text
              style={[
                styles.itemLabel,
                { color: colors.text },
              ]}
            >
              Weight
            </Text>

            <Text style={styles.itemValue}>
              {waterSettings?.weight_kg
                ? `${waterSettings.weight_kg} kg`
                : "Not set"}
            </Text>
          </View>

          <Text
            style={[
              styles.arrow,
              { color: colors.arrow },
            ]}
          >
            ›
          </Text>
        </Pressable>

        <View
          style={[
            styles.divider,
            {
              backgroundColor:
                colors.divider,
            },
          ]}
        />

        {/* ACTIVITY */}
        <Pressable
          style={styles.row}
          onPress={() =>
            router.push("/activity-history")
          }
        >
          <View>
            <Text
              style={[
                styles.itemLabel,
                { color: colors.text },
              ]}
            >
              Activity Level
            </Text>

            <Text style={styles.itemValue}>
              {waterSettings
                ? formatActivity(
                    waterSettings.activity_level
                  )
                : "Not set"}
            </Text>
          </View>

          <Text
            style={[
              styles.arrow,
              { color: colors.arrow },
            ]}
          >
            ›
          </Text>
        </Pressable>

        <View
          style={[
            styles.divider,
            {
              backgroundColor:
                colors.divider,
            },
          ]}
        />

        {/* WATER GOAL */}
        <Pressable
          style={styles.row}
          onPress={() =>
            router.push(
              "/water-goal-history"
            )
          }
        >
          <View>
            <Text
              style={[
                styles.itemLabel,
                { color: colors.text },
              ]}
            >
              Water Goal
            </Text>

            <Text style={styles.itemValue}>
              {waterGoal
                ? `${waterGoal} ml`
                : "Not set"}
            </Text>
          </View>

          <Text
            style={[
              styles.arrow,
              { color: colors.arrow },
            ]}
          >
            ›
          </Text>
        </Pressable>

        <View
          style={[
            styles.divider,
            {
              backgroundColor:
                colors.divider,
            },
          ]}
        />

        {/* CREATINE */}
        <Pressable
          style={styles.row}
          onPress={() =>
            router.push(
              "/creatine-history"
            )
          }
        >
          <View>
            <Text
              style={[
                styles.itemLabel,
                { color: colors.text },
              ]}
            >
              Creatine
            </Text>

            <Text style={styles.itemValue}>
              {waterSettings?.taking_creatine
                ? `${waterSettings.creatine_grams} g`
                : "Not taking"}
            </Text>
          </View>

          <Text
            style={[
              styles.arrow,
              { color: colors.arrow },
            ]}
          >
            ›
          </Text>
        </Pressable>
      </View>

      {/* STATISTICS */}
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.text },
        ]}
      >
        Statistics
      </Text>

      <View style={styles.statsGrid}>
        {/* WORKOUTS */}
        <View
          style={[
            styles.statCard,
            {
              backgroundColor:
                colors.card,
              borderColor:
                colors.border,
            },
          ]}
        >
          <Text style={styles.statIcon}>
            🏋️
          </Text>

          <Text
            style={[
              styles.statValue,
              { color: colors.text },
            ]}
          >
            {stats.workouts}
          </Text>

          <Text
            style={[
              styles.statLabel,
              { color: colors.secondary },
            ]}
          >
            Workouts
          </Text>
        </View>

        {/* SETS */}
        <View
          style={[
            styles.statCard,
            {
              backgroundColor:
                colors.card,
              borderColor:
                colors.border,
            },
          ]}
        >
          <Text style={styles.statIcon}>
            📦
          </Text>

          <Text
            style={[
              styles.statValue,
              { color: colors.text },
            ]}
          >
            {stats.totalSets}
          </Text>

          <Text
            style={[
              styles.statLabel,
              { color: colors.secondary },
            ]}
          >
            Total Sets
          </Text>
        </View>

        {/* STREAK */}
        <View
          style={[
            styles.statCard,
            {
              backgroundColor:
                colors.card,
              borderColor:
                colors.border,
            },
          ]}
        >
          <Text style={styles.statIcon}>
            🔥
          </Text>

          <Text
            style={[
              styles.statValue,
              { color: colors.text },
            ]}
          >
            {stats.streak}
          </Text>

          <Text
            style={[
              styles.statLabel,
              { color: colors.secondary },
            ]}
          >
            Day Streak
          </Text>
        </View>

        {/* VOLUME */}
        <View
          style={[
            styles.statCard,
            {
              backgroundColor:
                colors.card,
              borderColor:
                colors.border,
            },
          ]}
        >
          <Text style={styles.statIcon}>
            ⚡
          </Text>

          <Text
            style={[
              styles.statValue,
              { color: colors.text },
            ]}
          >
            {formatVolume(
              stats.volume
            )}
          </Text>

          <Text
            style={[
              styles.statLabel,
              { color: colors.secondary },
            ]}
          >
            Total Volume
          </Text>
        </View>
      </View>

      {/* LOGOUT */}
      <Pressable
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <Text style={styles.logoutText}>
          Log Out
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  content: {
    padding: 16,
    paddingBottom: 140,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
  },

  themeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  themeIcon: {
    fontSize: 22,
  },

  accountCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    marginBottom: 28,
    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  avatarText: {
    color: "#000",
    fontSize: 24,
    fontWeight: "800",
  },

  accountInfo: {
    flex: 1,
  },

  label: {
    fontSize: 13,
    marginBottom: 4,
  },

  username: {
    fontSize: 20,
    fontWeight: "700",
  },

  accountSettings: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
  },

  accountSettingsText: {
    fontSize: 13,
    fontWeight: "600",
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },

  card: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 26,
    overflow: "hidden",
  },

  row: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  itemLabel: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },

  itemValue: {
    color: "#22c55e",
    fontSize: 14,
    fontWeight: "600",
  },

  arrow: {
    fontSize: 28,
    fontWeight: "300",
  },

  divider: {
    height: 1,
    marginHorizontal: 16,
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 26,
  },

  statCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },

  statIcon: {
    fontSize: 22,
    marginBottom: 8,
  },

  statValue: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 3,
  },

  statLabel: {
    fontSize: 13,
  },

  logoutButton: {
    backgroundColor: "#dc2626",
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },

  logoutText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});