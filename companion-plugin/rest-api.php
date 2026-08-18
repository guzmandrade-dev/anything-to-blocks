<?php
/**
 * REST API endpoints for the Anything to Blocks Companion plugin.
 *
 * @package A2BCompanion
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register custom REST API routes.
 */
function a2b_register_rest_routes(): void {
	register_rest_route(
		'a2b/v1',
		'/block-types',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'a2b_rest_get_block_types',
			'permission_callback' => function () {
				return current_user_can( 'edit_posts' );
			},
		)
	);

	register_rest_route(
		'a2b/v1',
		'/block-patterns',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'a2b_rest_get_block_patterns',
			'permission_callback' => function () {
				return current_user_can( 'edit_posts' );
			},
		)
	);

	register_rest_route(
		'a2b/v1',
		'/templates',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'a2b_rest_get_templates',
			'permission_callback' => function () {
				return current_user_can( 'edit_posts' );
			},
		)
	);
}
add_action( 'rest_api_init', 'a2b_register_rest_routes' );

/**
 * REST callback: return all registered block templates and template parts.
 *
 * @param WP_REST_Request $request The REST request.
 * @return WP_REST_Response
 */
function a2b_rest_get_templates( WP_REST_Request $request ): WP_REST_Response {
	$filter_type = $request->get_param( 'type' ) ?? '';
	$result      = array();

	$types = $filter_type ? array( $filter_type ) : array( 'wp_template', 'wp_template_part' );

	foreach ( $types as $type ) {
		$templates = get_block_templates( array(), $type );
		foreach ( $templates as $template ) {
			$result[] = array(
				'id'          => $template->id ?? '',
				'slug'        => $template->slug ?? '',
				'theme'       => $template->theme ?? '',
				'type'        => $type,
				'area'        => $template->area ?? '',
				'title'       => $template->title ?? '',
				'description' => $template->description ?? '',
				'content'     => is_string( $template->content ) ? $template->content : '',
			);
		}
	}

	return new WP_REST_Response( $result, 200 );
}

/**
 * REST callback: return all registered block types with attributes and supports.
 *
 * @param WP_REST_Request $request The REST request.
 * @return WP_REST_Response
 */
function a2b_rest_get_block_types( WP_REST_Request $request ): WP_REST_Response {
	$registry   = WP_Block_Type_Registry::get_instance();
	$all_blocks = $registry->get_all();
	$category   = $request->get_param( 'category' ) ?? '';

	$result = array();
	foreach ( $all_blocks as $block_type ) {
		if ( $category && ( $block_type->category ?? '' ) !== $category ) {
			continue;
		}

		$result[] = array(
			'name'        => $block_type->name,
			'title'       => $block_type->title ?? '',
			'category'    => $block_type->category ?? '',
			'icon'        => is_string( $block_type->icon ) ? $block_type->icon : '',
			'description' => $block_type->description ?? '',
			'attributes'  => $block_type->attributes ?? array(),
			'supports'    => $block_type->supports ?? array(),
		);
	}

	return new WP_REST_Response( $result, 200 );
}

/**
 * REST callback: return all registered block patterns.
 *
 * @param WP_REST_Request $request The REST request.
 * @return WP_REST_Response
 */
function a2b_rest_get_block_patterns( WP_REST_Request $request ): WP_REST_Response {
	$registry     = WP_Block_Patterns_Registry::get_instance();
	$all_patterns = $registry->get_all();
	$category     = $request->get_param( 'category' ) ?? '';

	$result = array();
	foreach ( $all_patterns as $pattern ) {
		if ( $category && ( $pattern['categories'][0] ?? '' ) !== $category ) {
			continue;
		}

		$result[] = array(
			'name'       => $pattern['name'] ?? '',
			'title'      => $pattern['title'] ?? '',
			'content'    => $pattern['content'] ?? '',
			'categories' => $pattern['categories'] ?? array(),
			'keywords'   => $pattern['keywords'] ?? array(),
		);
	}

	return new WP_REST_Response( $result, 200 );
}

