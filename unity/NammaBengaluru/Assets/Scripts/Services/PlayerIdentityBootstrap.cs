using System;
using System.Threading.Tasks;
using Unity.Services.Authentication;
using Unity.Services.Core;
using UnityEngine;

namespace NammaBengaluru.Services
{
    // Starts Unity Gaming Services and signs the player in anonymously when the game boots.
    // Fire-and-forget: the game never waits on it, and offline play keeps working. Cloud Save,
    // Remote Config and Leaderboards should await PlayerIdentity.Ready before their first call.
    public static class PlayerIdentity
    {
        public static Task<bool> Ready { get; private set; } = Task.FromResult(false);

        public static string PlayerId =>
            UnityServices.State == ServicesInitializationState.Initialized && AuthenticationService.Instance.IsSignedIn
                ? AuthenticationService.Instance.PlayerId
                : null;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Bootstrap() => Ready = SignInAsync();

        static async Task<bool> SignInAsync()
        {
            try
            {
                if (UnityServices.State == ServicesInitializationState.Uninitialized)
                    await UnityServices.InitializeAsync();
                if (!AuthenticationService.Instance.IsSignedIn)
                    await AuthenticationService.Instance.SignInAnonymouslyAsync();
                Debug.Log($"[PlayerIdentity] Signed in anonymously as {AuthenticationService.Instance.PlayerId}");
                return true;
            }
            catch (Exception e)
            {
                // Offline or services unreachable: saves and leaderboards stay local this session.
                Debug.LogWarning($"[PlayerIdentity] Sign-in skipped: {e.Message}");
                return false;
            }
        }
    }
}
