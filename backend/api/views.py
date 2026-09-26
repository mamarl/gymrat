from django.contrib.auth.models import User

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.models import User
from django.contrib.auth.hashers import check_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from .models import (
    Workout,
    WorkoutSet,
    Routine,
    RoutineExercise,
    WaterLog,
    WaterSettings
)

from .serializers import (
    WorkoutSerializer,
    WorkoutSetSerializer,
    RoutineSerializer,
    RoutineExerciseSerializer,
    WaterLogSerializer,
    WaterSettingsSerializer
)


# =========================================================
# REGISTER
# =========================================================

@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):

    username = request.data.get("username")
    password = request.data.get("password")

    if not username or not password:
        return Response(
            {"error": "Username and password are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {"error": "Username already exists."},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = User.objects.create_user(
        username=username,
        password=password
    )

    return Response(
        {
            "message": "Account created successfully.",
            "username": user.username
        },
        status=status.HTTP_201_CREATED
    )

 
# =========================================================
# ACCOUNT SETTINGS
# =========================================================

@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def account(request):

    user = request.user

    # GET ACCOUNT
    if request.method == "GET":

        return Response(
            {
                "username": user.username
            },
            status=status.HTTP_200_OK
        )

    # PATCH ACCOUNT
    current_password = request.data.get(
        "current_password"
    )

    new_username = request.data.get(
        "username"
    )

    new_password = request.data.get(
        "new_password"
    )

    # Current password is required
    if not current_password:

        return Response(
            {
                "error": "Current password is required."
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    # Verify current password
    if not check_password(
        current_password,
        user.password
    ):

        return Response(
            {
                "error": "Current password is incorrect."
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    # =====================================================
    # CHANGE USERNAME
    # =====================================================

    if new_username is not None:

        new_username = new_username.strip()

        if not new_username:

            return Response(
                {
                    "error": "Username cannot be empty."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Don't do unnecessary update
        if new_username != user.username:

            if User.objects.filter(
                username__iexact=new_username
            ).exclude(
                id=user.id
            ).exists():

                return Response(
                    {
                        "error": "Username already exists."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            user.username = new_username

    # =====================================================
    # CHANGE PASSWORD
    # =====================================================

    if new_password is not None:

        if not new_password:

            return Response(
                {
                    "error": "New password cannot be empty."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if new_password == current_password:

            return Response(
                {
                    "error": "New password must be different from your current password."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        try:

            validate_password(
                new_password,
                user
            )

        except ValidationError as error:

            return Response(
                {
                    "error": error.messages[0]
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(
            new_password
        )

    user.save()

    return Response(
        {
            "message": "Account updated successfully.",
            "username": user.username
        },
        status=status.HTTP_200_OK
    )




# =========================================================
# WORKOUTS
# =========================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def workout_list(request):

    if request.method == "GET":

        workouts = Workout.objects.filter(
            user=request.user
        ).prefetch_related(
            "sets"
        ).order_by(
            "-started_at"
        )

        serializer = WorkoutSerializer(
            workouts,
            many=True
        )

        return Response(serializer.data)

    if request.method == "POST":

        workout = Workout.objects.create(
            user=request.user,
            name=request.data.get("name"),
            started_at=request.data.get("started_at"),
            ended_at=request.data.get("ended_at"),
        )

        serializer = WorkoutSerializer(workout)

        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED
        )


# =========================================================
# WORKOUT SETS
# =========================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def workout_sets(request, workout_id):

    try:

        workout = Workout.objects.get(
            id=workout_id,
            user=request.user
        )

    except Workout.DoesNotExist:

        return Response(
            {"error": "Workout not found."},
            status=status.HTTP_404_NOT_FOUND
        )

    if request.method == "GET":

        sets = WorkoutSet.objects.filter(
            workout=workout
        ).order_by(
            "created_at"
        )

        serializer = WorkoutSetSerializer(
            sets,
            many=True
        )

        return Response(serializer.data)

    if request.method == "POST":

        serializer = WorkoutSetSerializer(
            data=request.data
        )

        if serializer.is_valid():

            workout_set = serializer.save(
                workout=workout
            )

            return Response(
                WorkoutSetSerializer(
                    workout_set
                ).data,
                status=status.HTTP_201_CREATED
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


# =========================================================
# ROUTINES
# =========================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def routine_list(request):

    if request.method == "GET":

        routines = Routine.objects.filter(
            user=request.user
        ).prefetch_related(
            "exercises"
        ).order_by(
            "id"
        )

        serializer = RoutineSerializer(
            routines,
            many=True
        )

        return Response(serializer.data)

    if request.method == "POST":

        routine = Routine.objects.create(
            user=request.user,
            name=request.data.get("name")
        )

        serializer = RoutineSerializer(
            routine
        )

        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED
        )


# =========================================================
# ROUTINE DETAIL
# =========================================================

@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def routine_detail(request, routine_id):

    try:

        routine = Routine.objects.get(
            id=routine_id,
            user=request.user
        )

    except Routine.DoesNotExist:

        return Response(
            {"error": "Routine not found."},
            status=status.HTTP_404_NOT_FOUND
        )

    # UPDATE ROUTINE
    if request.method == "PATCH":

        name = request.data.get("name")

        if not name or not name.strip():

            return Response(
                {"error": "Routine name is required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        routine.name = name.strip()
        routine.save()

        return Response(
            RoutineSerializer(routine).data,
            status=status.HTTP_200_OK
        )

    # DELETE ROUTINE
    if request.method == "DELETE":

        routine.delete()

        return Response(
            {"message": "Routine deleted successfully."},
            status=status.HTTP_200_OK
        )


# =========================================================
# ROUTINE EXERCISES
# =========================================================

@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAuthenticated])
def routine_exercises(request, routine_id):

    try:

        routine = Routine.objects.get(
            id=routine_id,
            user=request.user
        )

    except Routine.DoesNotExist:

        return Response(
            {"error": "Routine not found."},
            status=status.HTTP_404_NOT_FOUND
        )

    # DELETE ALL EXERCISES
    if request.method == "DELETE":

        RoutineExercise.objects.filter(
            routine=routine
        ).delete()

        return Response(
            {"message": "Routine exercises deleted successfully."},
            status=status.HTTP_200_OK
        )

    # GET EXERCISES
    if request.method == "GET":

        exercises = RoutineExercise.objects.filter(
            routine=routine
        ).order_by(
            "position"
        )

        serializer = RoutineExerciseSerializer(
            exercises,
            many=True
        )

        return Response(serializer.data)

    # CREATE EXERCISE
    if request.method == "POST":

        serializer = RoutineExerciseSerializer(
            data=request.data
        )

        if serializer.is_valid():

            exercise = serializer.save(
                routine=routine
            )

            return Response(
                RoutineExerciseSerializer(
                    exercise
                ).data,
                status=status.HTTP_201_CREATED
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


# =========================================================
# WATER LOGS
# =========================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def water_list(request):

    # GET WATER LOGS
    if request.method == "GET":

        logs = WaterLog.objects.filter(
            user=request.user
        ).order_by(
            "-created_at"
        )

        serializer = WaterLogSerializer(
            logs,
            many=True
        )

        return Response(serializer.data)

    # CREATE WATER LOG
    if request.method == "POST":

        serializer = WaterLogSerializer(
            data=request.data
        )

        if serializer.is_valid():

            water_log = serializer.save(
                user=request.user
            )

            return Response(
                WaterLogSerializer(
                    water_log
                ).data,
                status=status.HTTP_201_CREATED
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


# =========================================================
# WATER LOG DETAIL
# =========================================================

@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def water_detail(request, water_id):

    try:

        water_log = WaterLog.objects.get(
            id=water_id,
            user=request.user
        )

    except WaterLog.DoesNotExist:

        return Response(
            {"error": "Water log not found."},
            status=status.HTTP_404_NOT_FOUND
        )

    water_log.delete()

    return Response(
        {"message": "Water log deleted successfully."},
        status=status.HTTP_200_OK
    )


# =========================================================
# WATER SETTINGS
# =========================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def water_settings(request):

    try:

        settings = WaterSettings.objects.get(
            user=request.user
        )

    except WaterSettings.DoesNotExist:

        settings = None

    # GET SETTINGS
    if request.method == "GET":

        if settings is None:

            return Response(
                {
                    "weight_kg": None,
                    "activity_level": "moderate",
                    "custom_goal_ml": None,
                    "taking_creatine": False,
                    "creatine_grams": 0
                }
            )

        serializer = WaterSettingsSerializer(
            settings
        )

        return Response(serializer.data)

    # CREATE OR UPDATE SETTINGS
    if request.method == "POST":

        if settings is None:

            serializer = WaterSettingsSerializer(
                data=request.data
            )

        else:

            serializer = WaterSettingsSerializer(
                settings,
                data=request.data,
                partial=True
            )

        if serializer.is_valid():

            settings = serializer.save(
                user=request.user
            )

            return Response(
                WaterSettingsSerializer(
                    settings
                ).data,
                status=status.HTTP_200_OK
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )