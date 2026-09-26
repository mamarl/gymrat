from rest_framework import serializers

from .models import (
    Workout,
    WorkoutSet,
    Routine,
    RoutineExercise,
    WaterLog,
    WaterSettings
)


# =========================================================
# WORKOUT SET
# =========================================================

class WorkoutSetSerializer(serializers.ModelSerializer):

    class Meta:
        model = WorkoutSet
        fields = [
            "id",
            "exercise",
            "weight",
            "reps",
            "created_at",
        ]


# =========================================================
# WORKOUT
# =========================================================

class WorkoutSerializer(serializers.ModelSerializer):

    sets = WorkoutSetSerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = Workout
        fields = [
            "id",
            "name",
            "started_at",
            "ended_at",
            "sets",
        ]


# =========================================================
# ROUTINE EXERCISE
# =========================================================

class RoutineExerciseSerializer(serializers.ModelSerializer):

    class Meta:
        model = RoutineExercise
        fields = [
            "id",
            "exercise",
            "position",
        ]


# =========================================================
# ROUTINE
# =========================================================

class RoutineSerializer(serializers.ModelSerializer):

    exercises = RoutineExerciseSerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = Routine
        fields = [
            "id",
            "name",
            "exercises",
        ]


# =========================================================
# WATER LOG
# =========================================================

class WaterLogSerializer(serializers.ModelSerializer):

    class Meta:
        model = WaterLog
        fields = [
            "id",
            "amount_ml",
            "created_at",
        ]


# =========================================================
# WATER SETTINGS
# =========================================================

class WaterSettingsSerializer(serializers.ModelSerializer):

    class Meta:
        model = WaterSettings
        fields = [
            "weight_kg",
            "activity_level",
            "custom_goal_ml",
            "taking_creatine",
            "creatine_grams",
        ]