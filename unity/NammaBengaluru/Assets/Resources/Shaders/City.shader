// The city's surfaces: a URP physically based shader with vertex colours and the world-space
// detail of src/world/surface.js. Variants:
//   _SURF_FACADE   painted plaster: the vertex colour tints only the wall (a luminance band),
//                  monsoon streaks and foot grime, glassy dark panes, randomly lit windows at night
//   _SURF_WINDOWS  glass towers: randomly lit windows at night
//   _SURF_SHOP     shopfront atlas: each 8 m tile picks a shop type from the vertex colour seed
//   _SURF_GROUND   two scales of macro variation; with _SURF_KERB, painted kerb faces
// Noise is evaluated in game coordinates (Unity z negated) so the patterns match the web game.
Shader "NammaBengaluru/City"
{
    Properties
    {
        _BaseMap ("Base map", 2D) = "white" {}
        _BaseColor ("Base colour", Color) = (1, 1, 1, 1)
        [Normal] _BumpMap ("Normal map", 2D) = "bump" {}
        _BumpScale ("Normal scale", Float) = 1
        _EmissionMap ("Emission map", 2D) = "white" {}
        [HDR] _EmissionColor ("Emission colour", Color) = (0, 0, 0, 1)
        _EmissionDay ("Emission by day", Float) = 0
        _EmissionNight ("Emission at night", Float) = 0
        _Roughness ("Roughness", Range(0, 1)) = 0.9
        _Metallic ("Metallic", Range(0, 1)) = 0
        _Cutoff ("Alpha cutoff", Range(0, 1)) = 0.5
        _MapScale ("UV scale", Vector) = (1, 1, 0, 0)
        _WindowGrid ("Windows per tile", Vector) = (2, 2, 0, 0)
        _ShopCells ("Shop atlas cols, rows", Vector) = (4, 2, 0, 0)
        _GroundStrength ("Ground variation", Float) = 1
        _WetResponse ("Wet response", Float) = 0
        [Toggle(_NORMALMAP)] _UseNormalMap ("Use normal map", Float) = 0
        [Toggle(_EMISSION)] _UseEmission ("Use emission", Float) = 0
        [Toggle(_ALPHATEST_ON)] _AlphaTest ("Alpha test", Float) = 0
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 2
        _OffsetFactor ("Depth offset factor", Float) = 0
        _OffsetUnits ("Depth offset units", Float) = 0
        _AO ("Baked ambient shading", Float) = 1
    }

    HLSLINCLUDE
    #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

    TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
    TEXTURE2D(_BumpMap); SAMPLER(sampler_BumpMap);
    TEXTURE2D(_EmissionMap); SAMPLER(sampler_EmissionMap);

    CBUFFER_START(UnityPerMaterial)
        float4 _BaseMap_ST;
        half4 _BaseColor;
        half _BumpScale;
        half4 _EmissionColor;
        half _EmissionDay, _EmissionNight;
        half _Roughness, _Metallic, _Cutoff;
        float4 _MapScale, _WindowGrid, _ShopCells;
        half _GroundStrength, _WetResponse, _AO;
    CBUFFER_END

    // Set every frame by the environment (day/night, monsoon).
    float _NB_Night;
    float _NB_Wet;
    ENDHLSL

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            Cull [_Cull]
            Offset [_OffsetFactor], [_OffsetUnits]

            HLSLPROGRAM
            #pragma target 3.0
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma shader_feature_local _NORMALMAP
            #pragma shader_feature_local _EMISSION
            #pragma shader_feature_local _ALPHATEST_ON
            #pragma shader_feature_local _ _SURF_FACADE _SURF_WINDOWS _SURF_SHOP _SURF_GROUND _SURF_KERB
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
            #pragma multi_compile _ _FORWARD_PLUS _CLUSTER_LIGHT_LOOP
            #pragma multi_compile_fog
            #pragma multi_compile_instancing

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "GroundAO.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float4 tangentOS : TANGENT;
                float2 uv : TEXCOORD0;
                half4 color : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
                half3 normalWS : TEXCOORD2;
                half4 color : TEXCOORD3;
                half fogFactor : TEXCOORD4;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            // ---- noise (surface.js) ----
            float svHash(float2 p) { return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
            float svNoise(float2 p)
            {
                float2 i = floor(p), f = frac(p), u = f * f * (3.0 - 2.0 * f);
                return lerp(lerp(svHash(i), svHash(i + float2(1, 0)), u.x), lerp(svHash(i + float2(0, 1)), svHash(i + float2(1, 1)), u.x), u.y);
            }
            float svFbm(float2 p) { return 0.5 * svNoise(p) + 0.3 * svNoise(p * 2.03 + 7.1) + 0.2 * svNoise(p * 4.1 + 3.3); }

            Varyings Vert(Attributes v)
            {
                Varyings o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_TRANSFER_INSTANCE_ID(v, o);
                VertexPositionInputs p = GetVertexPositionInputs(v.positionOS.xyz);
                o.positionCS = p.positionCS;
                o.positionWS = p.positionWS;
                o.normalWS = TransformObjectToWorldNormal(v.normalOS);
                o.uv = v.uv * _MapScale.xy;
                o.color = v.color;
                o.fogFactor = ComputeFogFactor(p.positionCS.z);
                return o;
            }

            // Lit windows at night: every window in the emission map can be lit; each picks for
            // itself whether it's on, and whether it's a warm bulb or a cool tubelight.
            half3 WindowLights(float2 uv, float3 gp, half3 emissive)
            {
                float2 wc = floor(uv * _WindowGrid.xy);
                float seed = dot(floor(gp.xz / 40.0), float2(7.13, 3.71));
                float h = frac(sin(dot(wc, float2(12.9898, 78.233)) + seed * 1.7) * 43758.5453);
                half3 wt = lerp(half3(1.0, 0.8, 0.55), half3(0.8, 0.92, 1.0), step(0.6, frac(h * 13.7)));
                return emissive * step(h, 0.42) * wt * (0.55 + 0.9 * frac(h * 7.1));
            }

            float4 ShopSample(TEXTURE2D_PARAM(tex, smp), float2 uv, half seedR)
            {
                float n = _ShopCells.x * _ShopCells.y;
                float vi = floor(frac(seedR * 7.13 + floor(uv.x) * 0.618 + floor(uv.y) * 0.31) * n);
                float2 cell = float2(fmod(vi, _ShopCells.x), floor(vi / _ShopCells.x));
                float2 sc = 1.0 / _ShopCells.xy;
                float2 suv = (clamp(frac(uv), 0.004, 0.996) + cell) * sc;
                return SAMPLE_TEXTURE2D_GRAD(tex, smp, suv, ddx(uv) * sc, ddy(uv) * sc);
            }

            half4 Frag(Varyings i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                float3 gp = float3(i.positionWS.x, i.positionWS.y, -i.positionWS.z); // game coordinates
                half3 normalWS = normalize(i.normalWS);
                half rough = _Roughness, metal = _Metallic;

                #if defined(_SURF_SHOP)
                    half4 tex = ShopSample(TEXTURE2D_ARGS(_BaseMap, sampler_BaseMap), i.uv, i.color.r);
                #else
                    half4 tex = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv);
                #endif
                half4 albedo = tex * _BaseColor;
                #if defined(_ALPHATEST_ON)
                    clip(albedo.a * i.color.a - _Cutoff);
                #endif

                #if defined(_SURF_FACADE)
                {
                    half lum = dot(tex.rgb, half3(0.299, 0.587, 0.114));
                    half glass = 1.0 - smoothstep(0.03, 0.12, lum);
                    half wall = smoothstep(0.24, 0.42, lum) * (1.0 - smoothstep(0.78, 0.88, lum));
                    float bh = frac(sin(dot(i.color.rgb, half3(12.989, 78.233, 37.719))) * 43758.5453);
                    half3 tint = lerp(dot(i.color.rgb, half3(0.3, 0.59, 0.11)).xxx, i.color.rgb, 0.8) * lerp(0.9, 1.06, bh) * lerp(0.9, 1.05, svNoise(gp.xz * 0.02));
                    albedo.rgb *= lerp(half3(1, 1, 1), tint, wall);
                    // Monsoon streaks running down the walls, and splash grime along the foot.
                    float streak = svFbm(float2((gp.x + gp.z) * 1.7, gp.y * 0.12 + bh * 9.0));
                    half grime = smoothstep(0.48, 0.9, streak) * 0.34 + (1.0 - smoothstep(0.3, 2.4, gp.y)) * 0.22;
                    albedo.rgb *= 1.0 - grime * (0.35 + 0.65 * wall);
                    // Window glass (the darkest texels) is smooth and a little metallic: it mirrors the sky.
                    rough = lerp(rough, 0.1, glass);
                    metal = lerp(metal, 0.55, glass);
                }
                #elif defined(_SURF_SHOP)
                    albedo.rgb *= lerp(0.86, 1.04, svNoise(gp.xz * 0.05)) * (1.0 - (1.0 - smoothstep(0.3, 1.6, gp.y)) * 0.18);
                #else
                    albedo.rgb *= i.color.rgb;
                #endif

                #if defined(_SURF_GROUND) || defined(_SURF_KERB)
                    albedo.rgb *= lerp(1.0, lerp(0.8, 1.08, svFbm(gp.xz / 23.0)) * lerp(0.93, 1.04, svNoise(gp.xz / 3.1)), _GroundStrength);
                #endif
                #if defined(_SURF_KERB)
                    if (normalWS.y < 0.5 && gp.y < 0.35)
                    {
                        half paint = step(0.38, svNoise(gp.xz / 70.0));
                        half st = step(0.5, frac((gp.x + gp.z) * 0.5));
                        half3 kc = lerp(half3(0.02, 0.02, 0.02), half3(0.62, 0.42, 0.02), st);
                        albedo.rgb = lerp(half3(0.42, 0.4, 0.37), kc, paint) * lerp(0.7, 1.0, svNoise(gp.xz * 2.0));
                    }
                #endif

                albedo.rgb *= lerp(1.0, NBGroundAO(gp, normalize(i.normalWS).y), _AO);

                // Monsoon: road-like surfaces darken and turn glossy in the rain.
                half wet = _NB_Wet * _WetResponse;
                albedo.rgb *= 1.0 - wet * 0.35;
                rough = lerp(rough, 0.18, wet);

                #if defined(_NORMALMAP)
                {
                    half3 nTS = UnpackNormalScale(SAMPLE_TEXTURE2D(_BumpMap, sampler_BumpMap, i.uv), _BumpScale);
                    // A tangent frame from screen-space derivatives (the city meshes carry no tangents).
                    float3 dp1 = ddx(i.positionWS), dp2 = ddy(i.positionWS);
                    float2 duv1 = ddx(i.uv), duv2 = ddy(i.uv);
                    float3 dp2perp = cross(dp2, normalWS), dp1perp = cross(normalWS, dp1);
                    float3 T = dp2perp * duv1.x + dp1perp * duv2.x;
                    float3 B = dp2perp * duv1.y + dp1perp * duv2.y;
                    float invmax = rsqrt(max(1e-12, max(dot(T, T), dot(B, B))));
                    normalWS = normalize(T * invmax * nTS.x + B * invmax * nTS.y + normalWS * nTS.z);
                }
                #endif

                half3 emission = 0;
                #if defined(_EMISSION)
                {
                    half intensity = lerp(_EmissionDay, _EmissionNight, _NB_Night);
                    #if defined(_SURF_SHOP)
                        half3 em = ShopSample(TEXTURE2D_ARGS(_EmissionMap, sampler_EmissionMap), i.uv, i.color.r).rgb;
                    #else
                        half3 em = SAMPLE_TEXTURE2D(_EmissionMap, sampler_EmissionMap, i.uv).rgb;
                    #endif
                    emission = _EmissionColor.rgb * intensity * em;
                    #if defined(_SURF_FACADE) || defined(_SURF_WINDOWS)
                        emission = WindowLights(i.uv, gp, emission);
                    #endif
                }
                #endif

                InputData input = (InputData)0;
                input.positionWS = i.positionWS;
                input.positionCS = i.positionCS;
                input.normalWS = normalWS;
                input.viewDirectionWS = GetWorldSpaceNormalizeViewDir(i.positionWS);
                input.shadowCoord = TransformWorldToShadowCoord(i.positionWS);
                input.fogCoord = i.fogFactor;
                input.bakedGI = SampleSH(normalWS);
                input.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(i.positionCS);
                input.shadowMask = half4(1, 1, 1, 1);

                SurfaceData s = (SurfaceData)0;
                s.albedo = albedo.rgb;
                s.alpha = 1;
                s.metallic = metal;
                s.smoothness = 1.0 - rough;
                s.normalTS = half3(0, 0, 1);
                s.emission = emission;
                s.occlusion = 1;
                s.specular = 0;

                half4 c = UniversalFragmentPBR(input, s);
                c.rgb = MixFog(c.rgb, i.fogFactor);
                return c;
            }
            ENDHLSL
        }

        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }
            ZWrite On ZTest LEqual ColorMask 0
            Cull [_Cull]

            HLSLPROGRAM
            #pragma vertex ShadowVert
            #pragma fragment ShadowFrag
            #pragma shader_feature_local _ALPHATEST_ON
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"

            float3 _LightDirection;
            float3 _LightPosition;

            struct A { float4 positionOS : POSITION; float3 normalOS : NORMAL; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct V { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; };

            V ShadowVert(A v)
            {
                V o;
                UNITY_SETUP_INSTANCE_ID(v);
                float3 ws = TransformObjectToWorld(v.positionOS.xyz);
                float3 n = TransformObjectToWorldNormal(v.normalOS);
                #if defined(_CASTING_PUNCTUAL_LIGHT_SHADOW)
                    float3 ld = normalize(_LightPosition - ws);
                #else
                    float3 ld = _LightDirection;
                #endif
                float4 cs = TransformWorldToHClip(ApplyShadowBias(ws, n, ld));
                #if UNITY_REVERSED_Z
                    cs.z = min(cs.z, UNITY_NEAR_CLIP_VALUE);
                #else
                    cs.z = max(cs.z, UNITY_NEAR_CLIP_VALUE);
                #endif
                o.positionCS = cs;
                o.uv = v.uv * _MapScale.xy;
                return o;
            }

            half4 ShadowFrag(V i) : SV_Target
            {
                #if defined(_ALPHATEST_ON)
                    clip(SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).a * _BaseColor.a - _Cutoff);
                #endif
                return 0;
            }
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ZWrite On ColorMask R
            Cull [_Cull]

            HLSLPROGRAM
            #pragma vertex DVert
            #pragma fragment DFrag
            #pragma shader_feature_local _ALPHATEST_ON
            #pragma multi_compile_instancing
            struct A { float4 positionOS : POSITION; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct V { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; };
            V DVert(A v) { V o; UNITY_SETUP_INSTANCE_ID(v); o.positionCS = TransformObjectToHClip(v.positionOS.xyz); o.uv = v.uv * _MapScale.xy; return o; }
            half DFrag(V i) : SV_Target
            {
                #if defined(_ALPHATEST_ON)
                    clip(SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).a * _BaseColor.a - _Cutoff);
                #endif
                return i.positionCS.z;
            }
            ENDHLSL
        }

        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode" = "DepthNormals" }
            ZWrite On
            Cull [_Cull]

            HLSLPROGRAM
            #pragma vertex NVert
            #pragma fragment NFrag
            #pragma shader_feature_local _ALPHATEST_ON
            #pragma multi_compile_instancing
            struct A { float4 positionOS : POSITION; float3 normalOS : NORMAL; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct V { float4 positionCS : SV_POSITION; float3 normalWS : TEXCOORD0; float2 uv : TEXCOORD1; };
            V NVert(A v) { V o; UNITY_SETUP_INSTANCE_ID(v); o.positionCS = TransformObjectToHClip(v.positionOS.xyz); o.normalWS = TransformObjectToWorldNormal(v.normalOS); o.uv = v.uv * _MapScale.xy; return o; }
            half4 NFrag(V i) : SV_Target
            {
                #if defined(_ALPHATEST_ON)
                    clip(SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).a * _BaseColor.a - _Cutoff);
                #endif
                return half4(normalize(i.normalWS), 0);
            }
            ENDHLSL
        }
    }
}
