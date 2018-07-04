#version 150
//#extension GL_ARB_shading_language_420pack : require
#extension GL_ARB_explicit_attrib_location : require

#define TASK 10
#define ENABLE_OPACITY_CORRECTION 0
#define ENABLE_LIGHTNING 0
#define ENABLE_SHADOWING 0

in vec3 ray_entry_position;

layout(location = 0) out vec4 FragColor;

uniform mat4 Modelview;

uniform sampler3D volume_texture;
uniform sampler2D transfer_texture;


uniform vec3    camera_location;
uniform float   sampling_distance;
uniform float   sampling_distance_ref;
uniform float   iso_value;
uniform vec3    max_bounds;
uniform ivec3   volume_dimensions;

uniform vec3    light_position;
uniform vec3    light_ambient_color;
uniform vec3    light_diffuse_color;
uniform vec3    light_specular_color;
uniform float   light_ref_coef;


bool
inside_volume_bounds(const in vec3 sampling_position)
{
    return (   all(greaterThanEqual(sampling_position, vec3(0.0)))
            && all(lessThanEqual(sampling_position, max_bounds)));
}


float
get_sample_data(vec3 in_sampling_pos)
{
    vec3 obj_to_tex = vec3(1.0) / max_bounds;
    return texture(volume_texture, in_sampling_pos * obj_to_tex).r;


}

vec3
get_gradient(vec3 in_sampling_pos)
{
		vec3 p = in_sampling_pos;
		vec3 voxel_size = max_bounds / volume_dimensions;
		float x = (get_sample_data(vec3(p.x + voxel_size.x, p.y, p.z)) - get_sample_data(vec3(p.x - voxel_size.x, p.y, p.z))) / 2;
		float y = (get_sample_data(vec3(p.x, p.y + voxel_size.y, p.z)) - get_sample_data(vec3(p.x, p.y - voxel_size.y, p.z))) / 2;
		float z = (get_sample_data(vec3(p.x, p.y, p.z + voxel_size.z)) - get_sample_data(vec3(p.x, p.y, p.z - voxel_size.z))) / 2;
		vec3 gradient = vec3(x, y, z);

		return gradient;
}

void main()
{
    /// One step trough the volume
    vec3 ray_increment      = normalize(ray_entry_position - camera_location) * sampling_distance;
    /// Position in Volume
    vec3 sampling_pos       = ray_entry_position + ray_increment; // test, increment just to be sure we are in the volume

    /// Init color of fragment
    vec4 dst = vec4(0.0, 0.0, 0.0, 0.0);

    /// check if we are inside volume
    bool inside_volume = inside_volume_bounds(sampling_pos);
    
    if (!inside_volume)
        discard;

#if TASK == 10
    vec4 max_val = vec4(0.0, 0.0, 0.0, 0.0);
    
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume) 
    {      
        // get sample
        float s = get_sample_data(sampling_pos);
                
        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));
           
        // this is the example for maximum intensity projection
        max_val.r = max(color.r, max_val.r);
        max_val.g = max(color.g, max_val.g);
        max_val.b = max(color.b, max_val.b);
        max_val.a = max(color.a, max_val.a);
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }

    dst = max_val;
#endif 
    
#if TASK == 11
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
	vec4 average = vec4(0.0,0.0,0.0,0.0);
	int count = 0;
    while (inside_volume)
    {      
        // get sample
        float s = get_sample_data(sampling_pos);

        // dummy code
        vec4 color = texture(transfer_texture, vec2(s,s));
		average.r += color.r;
		average.b += color.b;
		average.g += color.g;
		average.a += color.a;
		
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
		count++;
    }
	average.r /= count;
	average.b /= count;
	average.g /= count;
	average.a /= count;
	
	dst = average * 3;
	
#endif
    
#if TASK == 12 || TASK == 13
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
	vec4 iso = vec4(0,0,0,0);
    while (inside_volume)
    {
        // get sample
        float s = get_sample_data(sampling_pos);
		vec4 color = texture(transfer_texture, vec2(s,s));

        // dummy code
		if( s >= iso_value) {
			iso.r = color.r;
			iso.g = color.g;
			iso.b = color.b;
			iso.a = color.a;

#if TASK == 13 // Binary Search
		
        //IMPLEMENT;
		vec3 start = sampling_pos - ray_increment;
		vec3 end = sampling_pos;
		vec3 mid = (start + end) / 2.0;
		float s_mid = get_sample_data(mid);
		int count = 0;
		
		while(s_mid != iso_value) {
			if(s_mid < iso_value) {
				start = mid;
			}
			else if(s_mid > iso_value) {
				end = mid;
			}
			mid = (start + end) / 2.0;
			s_mid = get_sample_data(mid);
			
			// without this, it will run too much!
			if(++count > 100)
				break;
		}
	
		iso.r = color.r;
		iso.g = color.g;
		iso.b = color.b;
		iso.a = color.a;		
#endif


#if ENABLE_LIGHTNING == 1 // Add Shading

		float visibility = 1.0;
		vec3 gradient = get_gradient(sampling_pos);
		iso += vec4(gradient, 1.0);

		vec3 normal = normalize(get_gradient(sampling_pos));
		vec3 light = normalize(light_position - sampling_pos);
		vec3 camera = normalize(camera_location - sampling_pos);
		vec3 ref = reflect(-light, normal);
		float lambertian = max(dot(light, normal), 0.0);
		
		float specularAngle = pow(max(0.0, dot(ref, camera)), light_ref_coef);

		float diffuseAngle = max(0.0, dot(light, normal));
		vec3 ambient = light_ambient_color;
		vec3 diffuse = clamp((light_diffuse_color * diffuseAngle), 0.0, 1.0);
		vec3 specular = clamp((light_specular_color * specularAngle), 0.0, 1.0);
		
#if ENABLE_SHADOWING == 1 // Add Shadows
		
		vec3 current_pos = sampling_pos;
		vec3 tolight_increment = normalize(sampling_pos - light_position) * sampling_distance;
		
		while (inside_volume) {
			current_pos += tolight_increment;
			float s_shadow = get_sample_data(current_pos);
			if (s_shadow > iso_value) { //point is in shadow
				visibility = 0.3;
				break;
			}
			inside_volume = inside_volume_bounds(current_pos);
		}
#endif
		vec3 finalColor = (ambient + diffuse + specular) * visibility;
		iso = vec4(finalColor, 1.0);
#endif
		
			break;
			
		}
		
        // increment the ray sampling position
        sampling_pos += ray_increment;
		
        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
	
	dst = iso;
#endif 

#if TASK == 31
	
	int count = 0;
	float trans = 1.0;
	vec3 intensity = vec3(0.0, 0.0, 0.0);
	float prevO;
	float prevT = 0;
    
	// the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
#if ENABLE_OPACITY_CORRECTION == 1 // Opacity Correction
        IMPLEMENT;
#else
        float s = get_sample_data(sampling_pos);
		vec4 color = texture(transfer_texture, vec2(s,s));
		vec3 rgb = color.rgb;
		float opacity = color.a;
		vec3 I = rgb * opacity;

		
		trans = trans * (1 - prevO);
		intensity += trans * I;
		
		if(trans == 0.0 || ++count == 100)
			break;
		
        // increment the ray sampling position
        
		if(count == 1)
			intensity = I;
		
		prevO = opacity;
		dst = vec4(intensity, 1.0); //vec4(light_specular_color, 1.0);	
		sampling_pos += ray_increment;
		
		
#endif
		
#if ENABLE_LIGHTNING == 1 // Add Shading
        IMPLEMENT;
#endif

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
#endif 

    // return the calculated color value
    FragColor = dst;
}